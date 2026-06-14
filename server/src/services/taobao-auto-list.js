/**
 * Taobao auto-listing service via Playwright
 *
 * KEY BREAKTHROUGH (2026-06-13):
 *   Image upload works via the iframe-based file selector (sucai-selector-ng),
 *   NOT through the main page DOM. See uploadImagesViaIframe().
 *
 * Architecture:
 * - launchContext(): persistent browser context with saved login
 * - searchAndSelectCategory(): find and select product category
 * - fillForm(): fill title, price, stock on publish page
 * - uploadImagesViaIframe(): upload product images via iframe dialog
 * - submitAndVerify(): click submit and check success
 * - batchListToTaobao(): orchestrates the full flow
 */
import { chromium } from 'playwright';
import { join, resolve } from 'path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';

// Use absolute paths to avoid cwd issues
const PROJECT_ROOT = resolve(join(import.meta.url.replace('file:///', ''), '..', '..', '..'));
const USER_DATA_DIR = process.env.TAOBAO_PROFILE_DIR || join(PROJECT_ROOT, 'data', 'taobao-profile');
const SCREENSHOT_DIR = join(PROJECT_ROOT, 'data', 'screenshots');
const LOG_DIR = join(PROJECT_ROOT, 'data', 'logs');

// Helper: wrap a promise with a timeout
function withTimeout(promise, ms, label = '操作') {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}超时 (${ms / 1000}s)`)), ms)),
  ]);
}

// Structured logging
let _logPrefix = '';
function initLog(prefix) { _logPrefix = prefix; }

async function logStep(page, step, status, detail = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    step,
    status,
    url: page ? page.url() : '',
    detail,
  };
  const fname = `${_logPrefix}_${step}`;
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    writeFileSync(join(LOG_DIR, `${fname}.json`), JSON.stringify(entry, null, 2));
    if (page) {
      await page.screenshot({ path: join(LOG_DIR, `${fname}.png`), fullPage: false }).catch(() => {});
    }
  } catch {}
}

// ============================================================
// Browser launch
// ============================================================
async function launchContext() {
  for (const dir of [SCREENSHOT_DIR, LOG_DIR, USER_DATA_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  // Clean stale lock files
  for (const lock of ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'lockfile']) {
    try { rmSync(join(USER_DATA_DIR, lock), { recursive: true, force: true }); } catch {}
  }

  console.log('[Taobao] Launching browser (Playwright Chromium)...');

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN',
    timeout: 30000,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-session-crashed-bubble',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu-sandbox',
      '--start-maximized',
    ],
  });

  console.log('[Taobao] Browser launched successfully');
  return context;
}

// ============================================================
// Category resolution — return better search keywords
// ============================================================
function resolveCategory(product) {
  if (product.category && product.category.trim()) return product.category.trim();
  if (product.tags && product.tags.trim()) return product.tags.trim().split(',')[0];

  const title = product.title || '';
  // Map product keywords to Taobao category search keywords
  // These must be precise enough to find the correct Taobao category leaf
  // The Taobao AI search uses keyword matching, so use specific subcategory names
  const categoryMap = [
    { keywords: ['花茶', '菊花', '玫瑰', '茉莉', '桂花', '洛神', '花草', '金丝皇菊'], category: '组合型花茶' },
    { keywords: ['枸杞', '黄芪', '三七', '灵芝', '石斛', '人参', '当归', '党参'], category: '药食同源' },
    { keywords: ['红枣', '银耳', '燕窝', '阿胶', '鹿茸'], category: '滋补品' },
    { keywords: ['红茶', '绿茶', '铁观音', '普洱', '龙井', '乌龙', '白茶'], category: '茶叶' },
    { keywords: ['柠檬片', '陈皮', '薄荷', '决明子', '胖大海'], category: '组合型花茶' },
    { keywords: ['蜂蜜', '核桃', '葡萄干', '坚果'], category: '食品' },
    { keywords: ['手机壳', '数据线', '充电器', '耳机'], category: '手机配件' },
    { keywords: ['收纳', '整理箱', '置物架'], category: '收纳用品' },
  ];
  for (const { keywords, category } of categoryMap) {
    if (keywords.some(kw => title.includes(kw))) return category;
  }
  return title.split(/\s+/)[0] || '其他';
}

// ============================================================
// Category selection on Taobao AI publish page
// ============================================================
async function searchAndSelectCategory(page, cat) {
  console.log(`[Taobao] Searching category: "${cat}"`);
  await page.screenshot({ path: join(SCREENSHOT_DIR, `cat_entry_${Date.now()}.png`), fullPage: false });

  // Step 1: Click "搜索发品" tab
  console.log('[Taobao] Clicking search tab...');
  try {
    const tab = page.getByText('搜索发品');
    if (await tab.count() > 0) {
      await tab.first().click();
      await page.waitForTimeout(800);
    }
  } catch (e) {
    console.log('[Taobao] Search tab click error:', e.message);
  }

  // Step 2: Find and fill search input
  const searchInput = page.locator('input[placeholder*="类目"], input[placeholder*="关键词"], input[placeholder*="搜索"]').first();
  if (await searchInput.count() === 0) {
    console.log('[Taobao] Search input not found, trying fallback...');
    await page.screenshot({ path: join(SCREENSHOT_DIR, "no_cat_input.png"), fullPage: true });
    return false;
  }

  console.log('[Taobao] Typing category keyword...');
  await searchInput.click();
  await searchInput.fill(cat);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  console.log('[Taobao] Search submitted');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(SCREENSHOT_DIR, `after_cat_search_${Date.now()}.png`), fullPage: false });

  // Step 3: Click the first matching category result
  try {
    const results = page.locator('.sell-rich-text.path-text:not(.readonly), [class*="category-item"], [class*="result-item"]');
    const count = await results.count();
    if (count === 0) {
      console.log('[Taobao] No category results found');
      return false;
    }

    console.log(`[Taobao] Found ${count} category results`);

    // Try to find best match — prefer shorter/more specific results
    let target = null;
    const catLower = cat.toLowerCase();

    // First pass: exact or close match (avoid "花茶机" when searching "花茶")
    for (let i = 0; i < Math.min(count, 10); i++) {
      const txt = await results.nth(i).textContent().catch(() => '');
      const cleanTxt = txt.trim();
      console.log(`[Taobao] [${i}]: "${cleanTxt}"`);

      // Prefer results that end with our keyword (e.g., "花茶" not "花茶机")
      if (cleanTxt.endsWith(cat) || cleanTxt === cat) {
        target = results.nth(i);
        console.log(`[Taobao] Exact match: "${cleanTxt}"`);
        break;
      }
    }

    // Second pass: contains match
    if (!target) {
      for (let i = 0; i < Math.min(count, 10); i++) {
        const txt = await results.nth(i).textContent().catch(() => '');
        if (txt.includes(cat)) {
          // Avoid results where cat is followed by another character (e.g., 花茶机)
          const idx = txt.indexOf(cat);
          const afterCat = txt[idx + cat.length];
          if (!afterCat || afterCat === '>' || afterCat === '/' || afterCat === ' ') {
            target = results.nth(i);
            console.log(`[Taobao] Good match: "${txt.trim()}"`);
            break;
          }
        }
      }
    }

    // Third pass: any character overlap
    if (!target) {
      for (let i = 0; i < Math.min(count, 10); i++) {
        const txt = await results.nth(i).textContent().catch(() => '');
        if (cat.split('').some(c => txt.includes(c))) {
          target = results.nth(i);
          console.log(`[Taobao] Fallback match: "${txt.trim()}"`);
          break;
        }
      }
    }

    if (!target) target = results.first();

    const selectedText = await target.textContent();
    console.log(`[Taobao] Selected: "${selectedText}"`);
    await target.click();
    await page.waitForTimeout(1500);
  } catch (e) {
    console.log('[Taobao] Category selection error:', e.message);
    return false;
  }

  // Step 4: Click confirm button
  const confirmTexts = ['确定使用该类型', '确定', '下一步', '确认', '立即发布', '开始发布'];
  let confirmed = false;
  for (const txt of confirmTexts) {
    try {
      const btn = page.getByText(txt, { exact: false }).first();
      if (await btn.count() > 0 && await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`[Taobao] Clicking: "${txt}"`);
        await btn.click();
        await page.waitForTimeout(2000);
        confirmed = true;
        break;
      }
    } catch {}
  }

  // Step 5: Wait for redirect to publish page
  try {
    await page.waitForURL(/publish/, { timeout: 15000 });
    console.log('[Taobao] Redirected to publish page');
  } catch (e) {
    console.log('[Taobao] Redirect timeout:', e.message);
  }

  const finalUrl = page.url();
  const onPublish = finalUrl.includes('publish') && !finalUrl.includes('category');
  console.log(`[Taobao] Final URL: ${finalUrl}, onPublish: ${onPublish}`);
  return onPublish;
}

// ============================================================
// Form filling — based on real Taobao publish page DOM
// ============================================================
async function fillForm(page, title, price, desc, product) {
  console.log(`[Taobao] Filling form: "${title}" ¥${price}`);
  const filled = {
    title: false, price: false, qty: false, desc: false,
    brand: false, packaging: false, origin: false, freight: false,
    images: false,
  };

  // Wait for page to be ready
  await page.waitForTimeout(2000);

  // ---- Expand all sections ----
  console.log('[Taobao] Expanding sections...');
  for (const txt of ['展开收起项', '展开', '只看必填']) {
    try {
      const btn = page.getByText(txt, { exact: false }).first();
      if (await btn.count() > 0 && await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(500);
        console.log(`[Taobao] Expanded: "${txt}"`);
      }
    } catch {}
  }
  await page.waitForTimeout(1000);

  // ---- Step 1: Fill title ----
  fillTitle(page, title, filled);

  // ---- Step 2: Fill price ----
  fillPrice(page, price, filled);

  // ---- Step 3: Fill stock ----
  fillStock(page, filled);

  // ---- Step 4: Fill brand ----
  fillBrand(page, filled);

  // ---- Step 5: Fill packaging ----
  fillPackaging(page, filled);

  // ---- Step 6: Fill origin ----
  fillOrigin(page, filled);

  // ---- Step 7: Fill freight template ----
  fillFreight(page, filled);

  // ---- Step 8: Fill description ----
  if (desc) fillDescription(page, desc, filled);

  // ---- Step 9: Upload images ----
  const images = parseImages(product?.images);
  if (images.length > 0) {
    console.log(`[Taobao] Uploading ${images.length} images...`);
    try {
      await uploadImagesViaIframe(page, images);
      filled.images = true;
      console.log('[Taobao] ✓ Images uploaded');
    } catch (e) {
      filled.images = false;
      console.log('[Taobao] Image upload error:', e.message);
    }
  } else {
    console.log('[Taobao] ⚠ No images — 1:1主图 is required, will need manual upload');
    filled.images = false;
  }

  console.log('[Taobao] Fill summary:', JSON.stringify(filled));
  await page.screenshot({ path: join(SCREENSHOT_DIR, `after_fill_${Date.now()}.png`), fullPage: false });
  return filled;
}

// ── Individual field fillers ─────────────────────────────────────────

async function fillTitle(page, title, filled) {
  console.log('[Taobao] Filling title...');
  try {
    const titleResult = await page.evaluate(({ titleText }) => {
      const textareas = document.querySelectorAll('textarea');
      for (const ta of textareas) {
        const r = ta.getBoundingClientRect();
        if (r.width < 50 || r.height < 10) continue;
        if (r.top < 0 || r.top > 3000) continue;
        const parent = ta.closest('[class*="form"], [class*="Form"], [class*="item"], [class*="Item"], [class*="field"], [class*="Field"]') || ta.parentElement?.parentElement;
        const parentText = parent?.textContent || '';
        const maxLength = ta.getAttribute('maxlength');
        const isTitle = parentText.includes('宝贝标题') ||
                        parentText.includes('标题') && parentText.includes('60') ||
                        (maxLength === '60') ||
                        (ta.placeholder && ta.placeholder.includes('标题'));
        if (isTitle) {
          ta.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          setter.call(ta, titleText);
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
          setter.call(ta, titleText);
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          return { success: true, method: 'textarea-evaluate' };
        }
      }
      for (const ta of textareas) {
        const r = ta.getBoundingClientRect();
        if (r.width > 300 && r.height > 20 && r.height < 200) {
          ta.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          setter.call(ta, titleText);
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, method: 'textarea-fallback' };
        }
      }
      return { success: false, count: textareas.length };
    }, { titleText: title });

    if (titleResult.success) {
      filled.title = true;
      console.log(`[Taobao] ✓ Title: "${title}" (${titleResult.method})`);
    }
    if (!filled.title) {
      const ta = page.locator('textarea:visible').first();
      if (await ta.count() > 0) {
        await ta.click();
        await ta.fill(title);
        filled.title = true;
        console.log(`[Taobao] ✓ Title (playwright): "${title}"`);
      }
    }
  } catch (e) {
    console.log('[Taobao] Title fill error:', e.message);
  }
}

async function fillPrice(page, price, filled) {
  console.log('[Taobao] Filling price...');
  try {
    const priceResult = await page.evaluate(({ priceVal }) => {
      const inputs = document.querySelectorAll('input');
      for (const inp of inputs) {
        const r = inp.getBoundingClientRect();
        if (r.width < 20 || r.height < 8) continue;
        if (r.top < 0 || r.top > 3000) continue;
        const parent = inp.closest('[class*="form"], [class*="Form"], [class*="item"], [class*="Item"], [class*="field"], [class*="Field"]') || inp.parentElement?.parentElement;
        const parentText = parent?.textContent || '';
        const isPrice = parentText.includes('一口价') ||
                        (parentText.includes('元') && !parentText.includes('库存') && parentText.includes('价'));
        if (isPrice && inp.type !== 'hidden') {
          inp.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(inp, String(priceVal));
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true };
        }
      }
      return { success: false };
    }, { priceVal: price });

    if (priceResult.success) { filled.price = true; console.log(`[Taobao] ✓ Price: ${price}`); }

    if (!filled.price) {
      const allInputs = page.locator('input:visible:not([type="hidden"])');
      const ic = await allInputs.count();
      for (let i = 0; i < ic; i++) {
        const inp = allInputs.nth(i);
        const parentText = await inp.evaluate(el => {
          let p = el.parentElement;
          for (let d = 0; d < 4 && p; d++) {
            if ((p.textContent || '').includes('一口价')) return p.textContent;
            p = p.parentElement;
          }
          return '';
        });
        if (parentText.includes('一口价')) {
          const box = await inp.boundingBox().catch(() => null);
          if (box && box.width > 20) {
            await inp.click();
            await inp.fill(String(price));
            filled.price = true;
            console.log(`[Taobao] ✓ Price (playwright): ${price}`);
            break;
          }
        }
      }
    }
  } catch (e) {
    console.log('[Taobao] Price fill error:', e.message);
  }
}

async function fillStock(page, filled) {
  console.log('[Taobao] Filling stock...');
  try {
    const stockResult = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input');
      for (const inp of inputs) {
        const r = inp.getBoundingClientRect();
        if (r.width < 20 || r.height < 8) continue;
        if (r.top < 0 || r.top > 3000) continue;
        const parent = inp.closest('[class*="form"], [class*="Form"], [class*="item"], [class*="Item"], [class*="field"], [class*="Field"]') || inp.parentElement?.parentElement;
        const parentText = parent?.textContent || '';
        const isStock = parentText.includes('总库存') || (parentText.includes('库存') && parentText.includes('件'));
        if (isStock && inp.type !== 'hidden') {
          inp.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(inp, '9999');
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true };
        }
      }
      return { success: false };
    });
    if (stockResult.success) { filled.qty = true; console.log('[Taobao] ✓ Stock: 9999'); }
  } catch (e) {
    console.log('[Taobao] Stock fill error:', e.message);
  }
}

/**
 * Fill brand field. The brand field on Taobao publish form can be:
 * - A text input where you type a brand name
 * - A dropdown/select-like component
 * Strategy: first try to find an input near "品牌" text, fill "其他".
 * If that fails, try clicking the label to open a dropdown.
 */
async function fillBrand(page, filled) {
  console.log('[Taobao] Filling brand...');
  try {
    // Strategy A: direct input fill
    const brandResult = await page.evaluate(() => {
      // Walk every visible input looking for one whose parent text starts with "品牌"
      const inputs = document.querySelectorAll('input:not([type="hidden"])');
      for (const inp of inputs) {
        const r = inp.getBoundingClientRect();
        if (r.width < 30 || r.height < 8) continue;
        if (r.top < 0 || r.top > 5000) continue;
        // Check parent text up to 4 levels
        let el = inp;
        for (let d = 0; d < 5 && el; d++) {
          const t = (el.textContent || '').trim();
          if (/^品牌\s*$/.test(t) || (t.includes('品牌') && (t.includes('请输入') || t.includes('选择')))) {
            inp.focus();
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(inp, '其他');
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            inp.dispatchEvent(new Event('blur', { bubbles: true }));
            return { success: true, method: 'input' };
          }
          el = el.parentElement;
        }
      }
      return { success: false };
    });
    if (brandResult.success) { filled.brand = true; console.log('[Taobao] ✓ Brand: 其他'); return; }

    // Strategy B: click "品牌" label to open dropdown, then select first option
    const brandLabel = page.locator(':text-is("品牌")').first();
    if (await brandLabel.count() > 0) {
      await brandLabel.click();
      await page.waitForTimeout(800);
      // Try to type into whatever appeared
      const activeEl = page.locator(':focus');
      if (await activeEl.count() > 0) {
        await activeEl.fill('其他');
        await page.keyboard.press('Enter');
        filled.brand = true;
        console.log('[Taobao] ✓ Brand (label click + fill)');
        return;
      }
    }
    console.log('[Taobao] Brand fill failed (may need manual input)');
  } catch (e) {
    console.log('[Taobao] Brand fill error:', e.message);
  }
}

/**
 * Fill packaging field. Usually a dropdown or input.
 * Common values: "袋装", "罐装", "盒装", "散装"
 */
async function fillPackaging(page, filled) {
  console.log('[Taobao] Filling packaging...');
  const DEFAULT_PACKAGING = '袋装';
  try {
    // Strategy A: find input near "包装" text
    const pkgResult = await page.evaluate(({ pkg }) => {
      const inputs = document.querySelectorAll('input:not([type="hidden"])');
      for (const inp of inputs) {
        const r = inp.getBoundingClientRect();
        if (r.width < 30 || r.height < 8) continue;
        if (r.top < 0 || r.top > 5000) continue;
        let el = inp;
        for (let d = 0; d < 5 && el; d++) {
          const t = (el.textContent || '').trim();
          if (t.includes('包装') && (t.includes('请') || t.includes('选择') || t.length < 10)) {
            inp.focus();
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(inp, pkg);
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            inp.dispatchEvent(new Event('blur', { bubbles: true }));
            return { success: true, method: 'input' };
          }
          el = el.parentElement;
        }
      }
      return { success: false };
    }, { pkg: DEFAULT_PACKAGING });
    if (pkgResult.success) { filled.packaging = true; console.log(`[Taobao] ✓ Packaging: ${DEFAULT_PACKAGING}`); return; }

    // Strategy B: click the label
    const pkgLabel = page.locator('text="包装"').first();
    if (await pkgLabel.count() > 0 && await pkgLabel.isVisible({ timeout: 2000 }).catch(() => false)) {
      await pkgLabel.click();
      await page.waitForTimeout(600);
      // Type the value
      const kb = page.keyboard;
      await kb.type(DEFAULT_PACKAGING, { delay: 50 });
      await kb.press('Enter');
      filled.packaging = true;
      console.log(`[Taobao] ✓ Packaging (type): ${DEFAULT_PACKAGING}`);
      return;
    }
    console.log('[Taobao] Packaging fill failed');
  } catch (e) {
    console.log('[Taobao] Packaging fill error:', e.message);
  }
}

/**
 * Fill origin (产地) field. Usually a dropdown or input.
 * Default: "中国大陆" or city name.
 */
async function fillOrigin(page, filled) {
  console.log('[Taobao] Filling origin...');
  const DEFAULT_ORIGIN = '中国大陆';
  try {
    // Strategy A: find input near "产地" text
    const originResult = await page.evaluate(({ origin }) => {
      const inputs = document.querySelectorAll('input:not([type="hidden"])');
      for (const inp of inputs) {
        const r = inp.getBoundingClientRect();
        if (r.width < 30 || r.height < 8) continue;
        if (r.top < 0 || r.top > 5000) continue;
        let el = inp;
        for (let d = 0; d < 5 && el; d++) {
          const t = (el.textContent || '').trim();
          if ((t.includes('产地') || t.includes('原产地')) && (t.includes('请') || t.includes('选择') || t.length < 12)) {
            inp.focus();
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(inp, origin);
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            inp.dispatchEvent(new Event('blur', { bubbles: true }));
            return { success: true, method: 'input' };
          }
          el = el.parentElement;
        }
      }
      return { success: false };
    }, { origin: DEFAULT_ORIGIN });
    if (originResult.success) { filled.origin = true; console.log(`[Taobao] ✓ Origin: ${DEFAULT_ORIGIN}`); return; }

    // Strategy B: click label
    const originLabel = page.locator('text="产地"').first();
    if (await originLabel.count() > 0 && await originLabel.isVisible({ timeout: 2000 }).catch(() => false)) {
      await originLabel.click();
      await page.waitForTimeout(600);
      await page.keyboard.type(DEFAULT_ORIGIN, { delay: 50 });
      await page.keyboard.press('Enter');
      filled.origin = true;
      console.log(`[Taobao] ✓ Origin (type): ${DEFAULT_ORIGIN}`);
      return;
    }
    console.log('[Taobao] Origin fill failed');
  } catch (e) {
    console.log('[Taobao] Origin fill error:', e.message);
  }
}

/**
 * Fill freight template (运费模板). Usually a dropdown/select.
 * Default: try "包邮" or "运费模板" click.
 */
async function fillFreight(page, filled) {
  console.log('[Taobao] Filling freight template...');
  try {
    // Strategy A: look for "运费模板" or "运费" text, click to open selector
    const freightLabels = ['运费模板', '运费', '物流'];
    for (const label of freightLabels) {
      const el = page.locator(`text="${label}"`).first();
      if (await el.count() > 0 && await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Click the label or its parent to open dropdown
        await el.click();
        await page.waitForTimeout(800);

        // Look for dropdown options
        const options = page.locator('[class*="option"], [class*="item"], [class*="menu-item"], li, .select-item');
        const optCount = await options.count();
        if (optCount > 0) {
          await options.first().click();
          await page.waitForTimeout(500);
          filled.freight = true;
          console.log('[Taobao] ✓ Freight template selected');
          return;
        }

        // If no dropdown appeared, try typing "包邮"
        await page.keyboard.type('包邮', { delay: 50 });
        await page.keyboard.press('Enter');
        filled.freight = true;
        console.log('[Taobao] ✓ Freight (typed): 包邮');
        return;
      }
    }
    console.log('[Taobao] Freight fill failed');
  } catch (e) {
    console.log('[Taobao] Freight fill error:', e.message);
  }
}

async function fillDescription(page, desc, filled) {
  console.log('[Taobao] Filling description...');
  try {
    const descResult = await page.evaluate(({ descText }) => {
      const all = document.querySelectorAll('*');
      for (const el of all) {
        const txt = (el.textContent || '').trim();
        if (txt === '宝贝详情' || txt === '宝贝详情*') {
          let container = el.parentElement;
          for (let d = 0; d < 10 && container; d++) {
            const editors = container.querySelectorAll('[contenteditable="true"], .ql-editor, [class*="editor"], [class*="Editor"]');
            for (const ed of editors) {
              const r = ed.getBoundingClientRect();
              if (r.width > 100 && r.height > 50) {
                ed.focus();
                ed.innerHTML = `<p>${descText}</p>`;
                ed.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
              }
            }
            const tas = container.querySelectorAll('textarea');
            for (const ta of tas) {
              const r = ta.getBoundingClientRect();
              if (r.width > 100 && r.height > 50) {
                ta.focus();
                const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
                setter.call(ta, descText);
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                return true;
              }
            }
            container = container.parentElement;
          }
        }
      }
      return false;
    }, { descText: desc });

    filled.desc = descResult;
    if (descResult) console.log('[Taobao] ✓ Description filled');
  } catch (e) {
    console.log('[Taobao] Description fill error:', e.message);
  }
}

// ============================================================
// Image upload
// ============================================================
/**
 *
 * BREAKTHROUGH (2026-06-13): The previous 7 strategies all failed because
 * they searched for file inputs in the main page DOM. Taobao's image upload
 * actually lives inside a cross-origin iframe (sucai-selector-ng).
 *
 * This function navigates the iframe workflow:
 *   1. Click each upload slot (.item-medium or .sell-component-image-v2)
 *   2. In the opened iframe, click "本地上传" (triggers fileChooser)
 *   3. Upload the local image file via Playwright's fileChooser API
 *   4. Click the uploaded image name to select it
 *   5. Click "完成" to close the dialog and apply the image
 *
 * Known caveats:
 *   - The iframe is at market.m.taobao.com (cross-origin), so we use
 *     Playwright frame locators instead of raw DOM access.
 *   - File inputs inside the iframe are dynamically created on each click.
 *   - Upload order: 1:1主图 (5 slots) first, then 3:4主图 (5 slots).
 */
async function uploadImagesViaIframe(page, imagePaths) {
  const fs = await import('fs');
  const downloadDir = join(PROJECT_ROOT, 'data', 'temp-images');

  if (!existsSync(downloadDir)) mkdirSync(downloadDir, { recursive: true });

  // Collect all upload slots — 1:1主图 (medium, 90x90) + 3:4主图 (120px tall)
  const slots = page.locator('.sell-component-material-item-view');
  const slotCount = await slots.count();

  if (slotCount === 0) {
    throw new Error('No image upload slots found on the page');
  }

  console.log(`[Taobao] Found ${slotCount} upload slots, uploading ${imagePaths.length} images`);

  for (let i = 0; i < imagePaths.length; i++) {
    const imgPath = imagePaths[i];

    // Select the correct slot — 1:1主图 slots come first (.item-medium)
    let targetSlot;
    if (i < 5) {
      // 1:1 main image slots
      targetSlot = page.locator('.sell-component-material-item-view.item-medium').nth(i);
    } else {
      // 3:4 main image slots (fallback: use any remaining slot)
      targetSlot = slots.nth(Math.min(i, slotCount - 1));
    }

    // Verify slot exists
    const slotExists = await targetSlot.count();
    if (slotExists === 0) {
      console.log(`[Taobao] Slot ${i} not found, skipping`);
      continue;
    }

    // If the image path is a URL (not a local file), download it first
    let localPath = imgPath;
    if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
      try {
        const response = await fetch(imgPath);
        const buffer = Buffer.from(await response.arrayBuffer());
        const ext = imgPath.split('.').pop()?.split('?')[0] || 'jpg';
        localPath = join(downloadDir, `img_${i}_${Date.now()}.${ext}`);
        writeFileSync(localPath, buffer);
      } catch (e) {
        console.log(`[Taobao] Failed to download ${imgPath}: ${e.message}, skipping`);
        continue;
      }
    }

    // Verify local file exists
    if (!existsSync(localPath)) {
      console.log(`[Taobao] File not found: ${localPath}, skipping`);
      continue;
    }

    console.log(`[Taobao] Uploading image ${i + 1}/${imagePaths.length}: ${localPath}`);

    try {
      // Step 1: Click the upload slot to open the iframe dialog
      await targetSlot.click({ force: true });
      await page.waitForTimeout(1500);

      // Step 2: Wait for the sucai-selector iframe
      const picFrame = page.frameLocator('iframe[src*="sucai-selector"]');

      // Step 3: Click "本地上传" and catch the fileChooser
      const localBtn = picFrame.getByText('本地上传');
      const btnVisible = await localBtn.first().isVisible({ timeout: 5000 }).catch(() => false);

      if (!btnVisible) {
        console.log('[Taobao] "本地上传" not visible, retrying slot click...');
        await targetSlot.click({ force: true });
        await page.waitForTimeout(2000);
      }

      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null),
        localBtn.first().click({ timeout: 3000 }).catch(() => {})
      ]);

      if (!fileChooser) {
        // Fallback: try using setInputFiles directly on the hidden file input
        const fileInput = picFrame.locator('input[type="file"]').first();
        if (await fileInput.count() > 0) {
          await fileInput.setInputFiles(localPath);
          await page.waitForTimeout(2000);
        } else {
          console.log(`[Taobao] No fileChooser or file input for slot ${i}`);
          continue;
        }
      } else {
        await fileChooser.setFiles(localPath);
        await page.waitForTimeout(2000);
      }

      // Step 4: Click the uploaded image name in the iframe to select it
      const fileName = localPath.split('/').pop().split('\\').pop();
      const nameEl = picFrame.getByText(fileName).first();
      if (await nameEl.count() > 0) {
        await nameEl.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(500);
      } else {
        console.log(`[Taobao] File "${fileName}" not found in iframe list after upload`);
      }

      // Step 5: Click "完成" to confirm
      const doneBtn = picFrame.getByText('完成');
      if (await doneBtn.count() > 0) {
        await doneBtn.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }

      // Step 6: Verify — check if slot switched from dashed to solid
      const isFilled = await targetSlot.locator('.main-content.solid').count();
      const hasImg = await targetSlot.locator('img').count();
      console.log(`[Taobao] Slot ${i}: filled=${isFilled > 0}, hasImg=${hasImg > 0}`);

      // Close modal if still open (press Escape)
      const modal = page.locator('.next-overlay-inner.sell-component-image-v2-media-popup');
      if (await modal.isVisible({ timeout: 1000 }).catch(() => false)) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }

    } catch (e) {
      console.log(`[Taobao] Upload error for slot ${i}: ${e.message}`);
      // Try to close any open modals
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(500);
    }

    // Clean up temp file if it was downloaded
    if (localPath !== imgPath && existsSync(localPath)) {
      try { fs.rmSync(localPath); } catch {}
    }
  }

  // Final: check how many slots are filled
  const filledSlots = await page.locator('.sell-component-material-item-view .main-content.solid').count();
  const filledImgs = await page.locator('.sell-component-material-item-view img').count();
  console.log(`[Taobao] Upload complete: ${filledSlots} solid slots, ${filledImgs} images`);
}

function parseImages(imagesField) {
  if (!imagesField) return [];
  try {
    const parsed = typeof imagesField === 'string' ? JSON.parse(imagesField) : imagesField;
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {}
  return [];
}

// ============================================================
// Submit and verify
// ============================================================
async function submitAndVerify(page) {
  console.log('[Taobao] Attempting submit...');

  // First, wait for any visible form validation errors to settle
  await page.waitForTimeout(2000);

  // Check if form has unfilled required fields before submitting
  const preCheck = await page.evaluate(() => {
    const body = document.body?.innerText || '';
    const errorTexts = ['请填写', '请选择', '不能为空', '必填', '请正确填写'];
    const found = [];
    for (const t of errorTexts) {
      const m = body.match(new RegExp(`[^。\\n]{0,50}${t}[^。\\n]{0,50}`, 'gi'));
      if (m) found.push(...m.slice(0, 2));
    }
    return found;
  });
  if (preCheck.length > 0) {
    console.log('[Taobao] ⚠ Pre-submit validation errors detected:', JSON.stringify(preCheck));
  }

  // Find and click submit button
  const submitTexts = ['提交宝贝信息', '提交宝贝', '立刻上架', '放入仓库', '发布'];
  let clicked = false;
  for (const txt of submitTexts) {
    try {
      const btn = page.locator(`button:has-text("${txt}")`).first();
      if (await btn.count() > 0 && await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`[Taobao] Clicking: "${txt}"`);
        await btn.click();
        clicked = true;
        break;
      }
    } catch {}
  }

  if (!clicked) {
    // Try generic primary button
    try {
      const btn = page.locator('button[type="submit"], button.ant-btn-primary').first();
      if (await btn.count() > 0) {
        await btn.click();
        clicked = true;
      }
    } catch {}
  }

  if (!clicked) return { success: false, message: '未找到提交按钮' };

  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(SCREENSHOT_DIR, `after_submit_${Date.now()}.png`), fullPage: false });

  // Check result
  const result = await page.evaluate(() => {
    const body = document.body?.innerText || '';
    const url = window.location.href;
    const successTexts = ['发布成功', '上架成功', '提交成功', '商品发布成功', '成功发布'];
    const hasSuccess = successTexts.some(t => body.includes(t));
    const onSuccessPage = url.includes('sell/publish/success') || url.includes('publish/complete');

    const errorTexts = ['请填写', '请选择', '不能为空', '必填', '错误', '请正确填写', '未填写', '未上传'];
    const errors = [];
    for (const t of errorTexts) {
      const match = body.match(new RegExp(`[^。\\n]*${t}[^。\\n]*`, 'gi'));
      if (match) errors.push(...match.slice(0, 3));
    }

    return {
      success: hasSuccess || onSuccessPage,
      errors: [...new Set(errors)].slice(0, 5),
      url,
      bodyPreview: body.substring(0, 300),
    };
  });

  if (result.success) {
    const itemId = result.url.match(/id=(\d+)/)?.[1];
    return { success: true, message: '发布成功', itemId };
  }

  if (result.errors.length > 0) {
    return { success: false, message: `表单校验: ${result.errors.slice(0, 3).join('; ')}` };
  }

  return { success: false, message: '提交结果未知（可能需要补充图片）' };
}

// ============================================================
// Main batch listing orchestrator
// ============================================================
export async function batchListToTaobao(products) {
  console.log(`[Taobao] Starting batch listing ${products.length} products...`);

  const context = await launchContext();
  const page = context.pages()[0] || await context.newPage();

  // Login check
  console.log('[Taobao] Checking login status...');
  const loginErr = await page.goto('https://myseller.taobao.com/home.htm', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  }).catch(e => e);
  if (loginErr) console.log('[Taobao] Navigation error:', loginErr.message);
  await page.waitForTimeout(2000);

  const url = page.url();
  const isOnSellerPage = url.includes('myseller.taobao.com') || url.includes('item.upload.taobao.com');

  if (!isOnSellerPage) {
    if (url.includes('login') || url.includes('passport')) {
      console.log('[Taobao] Login required — please scan QR code...');
    } else {
      console.log('[Taobao] Navigating to login page...');
      await page.goto('https://login.taobao.com/member/login.jhtml', {
        waitUntil: 'domcontentloaded', timeout: 15000,
      }).catch(() => {});
    }

    try {
      await page.waitForFunction(
        () => {
          const u = window.location.href;
          return u.includes('myseller.taobao.com') || u.includes('item.upload.taobao.com');
        },
        { timeout: 300000, polling: 3000 }
      );
      await page.waitForTimeout(3000);
      console.log('[Taobao] Login completed');
    } catch (e) {
      console.log('[Taobao] Login timeout:', e.message);
    }
  } else {
    console.log('[Taobao] Already logged in');
  }

  // Process each product
  const results = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const title = p.title || '';
    const price = p.selling_price || p.cost_price || 0;
    const cat = resolveCategory(p);
    initLog(`product_${p.id}_${Date.now()}`);
    console.log(`\n[Taobao] (${i + 1}/${products.length}) ${title} [类目: ${cat}]`);

    const productResult = { id: p.id, title, success: false, message: '' };

    try {
      // Navigate to AI publish page
      const navErr = await page.goto('https://item.upload.taobao.com/sell/ai/category.htm?force=true', {
        waitUntil: 'domcontentloaded', timeout: 30000,
      }).catch(e => e);
      if (navErr) console.log('[Taobao] Nav error:', navErr.message);
      await page.waitForSelector('body', { timeout: 5000 }).catch(() => {});
      console.log(`[Taobao] URL: ${page.url()}`);

      await logStep(page, 'enter-search', 'ok', { title, cat });

      // Category selection
      const catOk = await searchAndSelectCategory(page, cat);
      await logStep(page, 'category-done', catOk ? 'success' : 'failed', { cat });

      if (!catOk) {
        console.log('[Taobao] Category selection failed, waiting for manual redirect...');
        try {
          await page.waitForFunction(
            () => {
              const u = window.location.href;
              return u.includes('publish') && !u.includes('category') && !u.includes('router');
            },
            { timeout: 120000, polling: 2000 }
          );
        } catch (e) {
          console.log('[Taobao] Redirect timeout:', e.message);
        }
      }

      // Fill form only if on publish page
      const currentUrl = page.url();
      if (currentUrl.includes('publish') && !currentUrl.includes('category')) {
        let fillResult = { title: false, price: false, qty: false };
        try {
          fillResult = await withTimeout(fillForm(page, title, price, p.description || '', p), 60000, '表单填写');
        } catch (e) {
          console.log('[Taobao] fillForm error:', e.message);
          await logStep(page, 'form-error', 'timeout', { error: e.message });
        }
        await logStep(page, 'form-done', fillResult.title && fillResult.price ? 'ok' : 'partial', fillResult);
        console.log(`[Taobao] Form: title=${fillResult.title} price=${fillResult.price} qty=${fillResult.qty}`);

        // Submit
        let submitResult = { success: false, message: '未执行提交' };
        try {
          submitResult = await withTimeout(submitAndVerify(page), 45000, '提交');
        } catch (e) {
          console.log('[Taobao] Submit error:', e.message);
          submitResult = { success: false, message: `提交超时: ${e.message}` };
        }
        await logStep(page, 'submit-done', submitResult.success ? 'success' : 'failed', submitResult);

        productResult.success = submitResult.success;
        productResult.message = submitResult.message;
        productResult.taobaoItemId = submitResult.itemId || null;

        if (submitResult.success) {
          console.log(`[Taobao] ✓ Published: ${title}`);
        } else {
          console.log(`[Taobao] ✗ Failed: ${title} — ${submitResult.message}`);
        }
      } else {
        console.log(`[Taobao] Not on publish page: ${currentUrl}`);
        productResult.message = '未到达发布页面，请检查类目选择';
      }
    } catch (err) {
      console.log(`[Taobao] Error:`, err.message);
      productResult.message = err.message;
      await logStep(page, 'error', 'exception', { error: err.message });
    }

    results.push(productResult);

    if (i < products.length - 1) {
      console.log('[Taobao] Waiting 5s before next...');
      await page.waitForTimeout(5000);
    }
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`\n[Taobao] Done: ${successCount}/${products.length} published`);
  return {
    success: successCount > 0,
    message: `${successCount}/${products.length} 件商品上架成功`,
    results,
  };
}
