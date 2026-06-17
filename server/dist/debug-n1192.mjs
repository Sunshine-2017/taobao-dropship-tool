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

  // Use system browser channel (chrome/msedge) to reuse login cookies
  // Set env BROWSER_CHANNEL=msedge to use Edge, BROWSER_CHANNEL=chrome for Chrome
  // Set USE_CHROME_CHANNEL=false to use Playwright's built-in Chromium
  const browserChannel = process.env.BROWSER_CHANNEL || 
    (process.env.USE_CHROME_CHANNEL !== 'false' ? 'chrome' : null);
  console.log('[Taobao] Launching browser (channel: ' + (browserChannel || 'chromium') + ')...');

  const launchOpts = {
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
  };
  if (browserChannel) {
    launchOpts.channel = browserChannel;
  }

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, launchOpts);

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

  // Step -1: CRITICAL — detect login redirect. If we got bounced to login,
  // the page will have no category content and all our selectors will fail silently.
  // Instead of returning false, wait for user to scan QR code to log in.
  const currentUrl = page.url();
  if (currentUrl.includes('login') || currentUrl.includes('passport') || currentUrl.includes('oauth')) {
    console.log('[Taobao] ⛔ REDIRECTED TO LOGIN PAGE — browser has no Taobao cookie!');
    console.log(`[Taobao] Current URL: ${currentUrl}`);
    await page.screenshot({ path: join(SCREENSHOT_DIR, 'LOGIN_REDIRECT_DETECTED.png'), fullPage: false });
    console.log('[Taobao] ⏳ Waiting for login (scan QR code in the browser window)...');
    console.log('[Taobao]    Will wait up to 5 minutes for login to complete.');
    try {
      await page.waitForFunction(() => {
        const u = window.location.href;
        return !u.includes('login') && !u.includes('passport') && (u.includes('myseller.taobao.com') || u.includes('item.upload.taobao.com') || u.includes('qn.taobao.com'));
      }, { timeout: 300000, polling: 2000 });
      console.log('[Taobao] ✓ Login detected! Continuing with category selection...');
      await page.waitForTimeout(3000);
      // Re-navigate to AI category page now that we're logged in
      await page.goto('https://item.upload.taobao.com/sell/ai/category.htm?force=true', {
        waitUntil: 'domcontentloaded', timeout: 30000,
      }).catch(e => console.log('[Taobao] Nav error after login:', e.message));
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log('[Taobao] ✗ Login timeout (5 min) — user did not scan QR code');
      console.log(`[Taobao]    ${e.message}`);
      await page.screenshot({ path: join(SCREENSHOT_DIR, 'LOGIN_TIMEOUT.png'), fullPage: false });
      return false;
    }
  }

  // Also check: does the page body have actual category content?
  const hasContent = await page.evaluate(() => {
    const body = document.body?.innerText || '';
    // Category page should have "搜索发品" or "以图发品" or "推荐发品"
    return body.includes('搜索发品') || body.includes('以图发品') || body.includes('推荐发品') || body.includes('类目');
  });
  if (!hasContent) {
    console.log('[Taobao] ⛔ Category page has no recognizable content — likely login redirect or blank page');
    const bodyPreview = await page.evaluate(() => (document.body?.innerText || '').substring(0, 200));
    console.log(`[Taobao] Body preview: "${bodyPreview}"`);
    await page.screenshot({ path: join(SCREENSHOT_DIR, 'CATEGORY_PAGE_BLANK.png'), fullPage: true });
    return false;
  }
  console.log('[Taobao] ✓ Category page has content, proceeding...');

  // Step 0: First try the "推荐发品" tab — click a recommended category matching our keyword
  console.log('[Taobao] Trying recommended tab first...');
  try {
    const recTab = page.getByText('推荐发品');
    if (await recTab.count() > 0 && await recTab.first().isVisible().catch(() => false)) {
      console.log('[Taobao] Found "推荐发品" tab, looking for matching category...');
      const recItems = page.locator('[class*="category-item"], [class*="tag"], [class*="recommend"], [class*="card"], a, button').filter({ hasText: cat });
      const recCount = await recItems.count();
      if (recCount > 0) {
        for (let i = 0; i < Math.min(recCount, 20); i++) {
          const txt = await recItems.nth(i).textContent().catch(() => '');
          if (txt && txt.trim().includes(cat)) {
            console.log(`[Taobao] Clicking recommended category: "${txt.trim()}"`);
            await recItems.nth(i).click();
            await page.waitForTimeout(2000);
            const url = page.url();
            if (url.includes('publish') && !url.includes('category')) {
              console.log('[Taobao] Redirected to publish page via recommended category!');
              return true;
            }
            break;
          }
        }
      } else {
        console.log('[Taobao] No matching recommended category found, falling back to search tab');
      }
    } else {
      console.log('[Taobao] "推荐发品" tab not found or not visible');
    }
  } catch (e) {
    console.log('[Taobao] Recommended tab attempt error:', e.message);
  }
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
  const searchInput = page.locator([
    'input[placeholder*="类目"]',
    'input[placeholder*="关键词"]', 
    'input[placeholder*="搜索"]',
    'input[placeholder*="商品名称"]',
    'div[contenteditable="true"][placeholder*="类目"]',
    '[class*="search"] input',
  ].join(',')).first();
  if (await searchInput.count() === 0) {
    console.log('[Taobao] Search input not found, trying fallback...');
    // Fallback: try any visible input on page
    const fallbackSearch = page.locator('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):visible').first();
    if (await fallbackSearch.count() > 0) {
      console.log('[Taobao] ✓ Fallback input found, using it');
      await fallbackSearch.click();
      await fallbackSearch.fill(cat);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
    } else {
      console.log('[Taobao] ⛔ No visible fallback input found');
      await page.screenshot({ path: join(SCREENSHOT_DIR, "no_cat_input.png"), fullPage: true });
      return false;
    }
  // Step 3: Click the first matching category result
  try {
    const results = page.locator('.sell-rich-text.path-text:not(.readonly), [class*="category-item"], [class*="result-item"]');
    const count = await results.count();
    if (count === 0) {
      console.log('[Taobao] No category results found');
      return false;
    }

    console.log(`[Taobao] Found ${count} category results`);

    // Try to find best match
    let target = null;
    const catLower = cat.toLowerCase();

    // First pass: exact or close match
    for (let i = 0; i < Math.min(count, 15); i++) {
      const txt = await results.nth(i).textContent().catch(() => '');
      const cleanTxt = txt.trim();
      console.log(`[Taobao] [${i}]: "${cleanTxt}"`);

      if (cleanTxt.endsWith(cat) || cleanTxt === cat || cleanTxt.includes('>>' + cat) || cleanTxt === cat.trim()) {
        target = results.nth(i);
        console.log(`[Taobao] Exact match: "${cleanTxt}"`);
        break;
      }
    }

    // Second pass: contains match — but only if the match has the keyword as a full segment
    if (!target) {
      for (let i = 0; i < Math.min(count, 15); i++) {
        const txt = await results.nth(i).textContent().catch(() => '');
        // Require cat to appear as a whole segment (surrounded by >> or start/end)
        if (txt.includes('>>' + cat) || txt.includes(cat + '>>') || txt === cat) {
          target = results.nth(i);
          console.log(`[Taobao] Good match: "${txt.trim()}"`);
          break;
        }
      }
    }

    // Third pass: pick the first result — but log a warning
    if (!target) {
      console.log(`[Taobao] ⚠ No good match found for "${cat}" among ${count} results. Picking first result.`);
      target = results.first();
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
        await page.waitForTimeout(5000);
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
  for (const txt of ['展开收起项', '展开', '只看必填', '展开更多', '全部展开', '更多设置', '展开更多选项']) {
    try {
      const btn = page.getByText(txt, { exact: false }).first();
      if (await btn.count() > 0 && await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(500);
        console.log(`[Taobao] Expanded: "${txt}"`);
      }
    } catch {}
  }

  // Scroll to top of form first
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  // ---- Step 1: Fill title ----
  await fillTitle(page, title, filled);

  // ---- Step 2: Fill price ----
  await fillPrice(page, price, filled);

  // ---- Step 3: Fill stock ----
  await fillStock(page, filled);

  // ---- Step 4: Fill brand ----
  await fillBrand(page, filled);

  // ---- Step 5: Fill packaging ----
  await fillPackaging(page, filled);

  // ---- Step 6: Fill origin ----
  await fillOrigin(page, filled);

  // ---- Step 7: Fill freight template ----
  await fillFreight(page, filled);

  // ---- Step 8: Fill description ----
  if (desc) await fillDescription(page, desc, filled);

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
    // Diagnostic: title is INPUT (w=668, placeholder="最多允许输入60个汉字（60字符）")
    // NOT a textarea. Also try textarea fallback.
    const titleResult = await page.evaluate(({ titleText }) => {
      // Strategy A: Look for input with 60-char placeholder
      const inputs = document.querySelectorAll('input:not([type="hidden"])');
      for (const inp of inputs) {
        const r = inp.getBoundingClientRect();
        if (r.width < 200 || r.height < 10) continue;
        const ph = (inp.placeholder || '');
        if (ph.includes('60个汉字') || ph.includes('60字符') || ph.includes('最多允许输入')) {
          inp.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(inp, titleText);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, method: 'input-placeholder' };
        }
      }

      // Strategy B: Look for textarea (old form layout)
      const textareas = document.querySelectorAll('textarea');
      for (const ta of textareas) {
        const r = ta.getBoundingClientRect();
        if (r.width < 50 || r.height < 10) continue;
        if (r.top < 0 || r.top > 3000) continue;
        const parent = ta.closest('[class*="form"], [class*="Form"], [class*="item"], [class*="Item"], [class*="field"], [class*="Field"]') || ta.parentElement?.parentElement;
        const parentText = parent?.textContent || '';
        const maxLength = ta.getAttribute('maxlength');
        if (parentText.includes('宝贝标题') ||
            (parentText.includes('标题') && parentText.includes('60')) ||
            (maxLength === '60') ||
            (ta.placeholder && ta.placeholder.includes('标题'))) {
          ta.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
          setter.call(ta, titleText);
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, method: 'textarea-evertit' };
        }
      }
      return { success: false, count: textareas.length };
    }, { titleText: title });

    if (titleResult.success) {
      filled.title = true;
      console.log(`[Taobao] ✓ Title: "${title}" (${titleResult.method})`);
      return;
    }

    // Playwright fallback: find input with 60-char placeholder
    if (!filled.title) {
      const titleInput = page.locator('input[placeholder*="60个汉字"], input[placeholder*="60字符"], textarea:visible').first();
      if (await titleInput.count() > 0) {
        await titleInput.click();
        await titleInput.fill(title);
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
 * Fill brand field. Based on diagnostic:
 * - INPUT @ w=88px top=1107, placeholder="请选择" (it's a dropdown/selector)
 * - Label text "品牌" nearby
 * Strategy: click the input to open dropdown, then pick first option or type
 */
async function fillBrand(page, filled) {
  console.log('[Taobao] Filling brand (dropdown)...');
  try {
    // Diagnostic confirmed: brand is a "请选择" dropdown INPUT @ top≈1100px
    // Approach: find the input by its narrow width near brand label text
    const brandResult = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input:not([type="hidden"])');
      for (const inp of inputs) {
        const r = inp.getBoundingClientRect();
        // Narrow width + reasonable top range — brand dropdown is ~88px wide
        if (r.width < 30 || r.width > 120 || r.height < 8) continue;
        if (r.top < 600 || r.top > 2000) continue;
        const ph = (inp.placeholder || '').trim();
        // Match by placeholder: "请选择" + near "品牌" text
        if (ph.includes('请选择')) {
          // Check parent text for "品牌"
          let el = inp.parentElement;
          for (let d = 0; d < 4 && el; d++) {
            const t = (el.textContent || '').trim();
            if (t.includes('品牌')) {
              // Click the input to open dropdown
              inp.click();
              return { success: true, method: 'click', width: r.width, top: r.top };
            }
            el = el.parentElement;
          }
        }
      }
      return { success: false };
    });

    if (brandResult.success) {
      filled.brand = true;
      console.log('[Taobao] ✓ Brand dropdown clicked');
      await page.waitForTimeout(1200);
      // After clicking, a dropdown menu appears. Pick first option or type.
      // Try clicking first dropdown option
      const firstOption = page.locator('[class*="option"], [class*="menu-item"], [class*="select-item"], [class*="dropdown"] li, .next-menu-item, .next-select-item').first();
      if (await firstOption.count() > 0 && await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstOption.click();
        console.log('[Taobao] ✓ Brand: selected first option');
      } else {
        // Type "其他" as fallback
        await page.keyboard.type('其他', { delay: 80 });
        await page.keyboard.press('Enter');
        console.log('[Taobao] ✓ Brand: typed 其他');
      }
      await page.waitForTimeout(500);
      return;
    }

    // Strategy C: direct Playwright click on brand label + type
    console.log('[Taobao] Brand evaluate failed, trying Playwright...');
    const brandInput = page.locator('input[placeholder*="请选择"]').filter({ has: page.locator('xpath=..//*[contains(text(),"品牌")]') }).first();
    if (await brandInput.count() === 0) {
      // Fallback: click any narrow input between top 600-2000 with "请选择" placeholder
      const allInputs = page.locator('input[placeholder*="请选择"]');
      const ic = await allInputs.count();
      for (let i = 0; i < ic; i++) {
        const inp = allInputs.nth(i);
        const box = await inp.boundingBox().catch(() => null);
        if (box && box.width > 30 && box.width < 120 && box.y > 600 && box.y < 2000) {
          await inp.click();
          await page.waitForTimeout(800);
          const opts = page.locator('[class*="option"], [class*="menu-item"], li[class*="select"]');
          if (await opts.count() > 0) { await opts.first().click(); filled.brand = true; break; }
          await page.keyboard.type('其他', { delay: 50 });
          await page.keyboard.press('Enter');
          filled.brand = true;
          console.log('[Taobao] ✓ Brand (playwright narrow-input): 其他');
          break;
        }
      }
    } else {
      await brandInput.click();
      await page.waitForTimeout(800);
      await page.keyboard.type('其他', { delay: 50 });
      await page.keyboard.press('Enter');
      filled.brand = true;
      console.log('[Taobao] ✓ Brand (playwright): 其他');
    }
  } catch (e) {
    console.log('[Taobao] Brand fill error:', e.message);
  }
}

/**
 * Fill packaging field. Based on diagnostic:
 * - INPUT @ w=187px top=772, placeholder="请选择" (dropdown)
 * - Label text "包装方式" nearby
 * Strategy: click the dropdown, pick first option or type "袋装"
 */
async function fillPackaging(page, filled) {
  console.log('[Taobao] Filling packaging (dropdown)...');
  const DEFAULT_PACKAGING = '袋装';
  try {
    // Packaging dropdown INPUT @ top≈770, w≈187, placeholder="请选择"
    const pkgResult = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input:not([type="hidden"])');
      for (const inp of inputs) {
        const r = inp.getBoundingClientRect();
        // Packaging dropdown: wider than brand, ~150-200px
        if (r.width < 100 || r.width > 250 || r.height < 8) continue;
        if (r.top < 500 || r.top > 2000) continue;
        const ph = (inp.placeholder || '').trim();
        if (ph.includes('请选择')) {
          let el = inp.parentElement;
          for (let d = 0; d < 4 && el; d++) {
            const t = (el.textContent || '').trim();
            if (t.includes('包装')) {
              inp.click();
              return { success: true, method: 'click', width: r.width, top: r.top };
            }
            el = el.parentElement;
          }
        }
      }
      return { success: false };
    });

    if (pkgResult.success) {
      filled.packaging = true;
      console.log('[Taobao] ✓ Packaging dropdown clicked');
      await page.waitForTimeout(1200);
      const firstOption = page.locator('[class*="option"], [class*="menu-item"], [class*="select-item"], [class*="dropdown"] li, .next-menu-item, .next-select-item').first();
      if (await firstOption.count() > 0 && await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstOption.click();
        console.log(`[Taobao] ✓ Packaging: selected first option`);
      } else {
        await page.keyboard.type(DEFAULT_PACKAGING, { delay: 80 });
        await page.keyboard.press('Enter');
        console.log(`[Taobao] ✓ Packaging: typed ${DEFAULT_PACKAGING}`);
      }
      await page.waitForTimeout(500);
      return;
    }

    // Fallback
    console.log('[Taobao] Packaging evaluate failed, trying Playwright...');
    const allInputs = page.locator('input[placeholder*="请选择"]');
    const ic = await allInputs.count();
    for (let i = 0; i < ic; i++) {
      const inp = allInputs.nth(i);
      const box = await inp.boundingBox().catch(() => null);
      if (box && box.width > 100 && box.width < 250 && box.y > 500 && box.y < 2000) {
        const parentText = await inp.evaluate(el => {
          let p = el.parentElement;
          for (let d = 0; d < 4 && p; d++) {
            if ((p.textContent || '').includes('包装')) return p.textContent;
            p = p.parentElement;
          }
          return '';
        });
        if (parentText.includes('包装')) {
          await inp.click();
          await page.waitForTimeout(800);
          await page.keyboard.type(DEFAULT_PACKAGING, { delay: 50 });
          await page.keyboard.press('Enter');
          filled.packaging = true;
          console.log(`[Taobao] ✓ Packaging (playwright): ${DEFAULT_PACKAGING}`);
          break;
        }
      }
    }
  } catch (e) {
    console.log('[Taobao] Packaging fill error:', e.message);
  }
}

/**
 * Fill origin (产地) field. Based on diagnostic:
 * - Origin was not explicitly listed in the diagnostic results
 * - Likely another "请选择" dropdown, between packaging (top=772) and price (top=2172)
 * Strategy: scan for "请选择" inputs in the expected range and try to fill
 */
async function fillOrigin(page, filled) {
  console.log('[Taobao] Filling origin...');
  const DEFAULT_ORIGIN = '中国大陆';
  try {
    // Scan for any remaining unfilled "请选择" dropdowns in the upper half
    const originResult = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input:not([type="hidden"])');
      for (const inp of inputs) {
        const r = inp.getBoundingClientRect();
        if (r.width < 30 || r.height < 8) continue;
        if (r.top < 500 || r.top > 2200) continue;
        const ph = (inp.placeholder || '').trim();
        if (ph.includes('请选择')) {
          // Check parent chain for "产地" keyword
          let el = inp;
          for (let d = 0; d < 6 && el; d++) {
            const t = (el.textContent || '').trim();
            if (t.includes('产地') || t.includes('原产地') || t.includes('货源地')) {
              inp.click();
              return { success: true, method: 'click', width: r.width, top: r.top };
            }
            el = el.parentElement;
          }
        }
      }
      // Fallback: look for any input whose parent text contains "产地" regardless of placeholder
      for (const inp of inputs) {
        const r = inp.getBoundingClientRect();
        if (r.width < 30 || r.height < 8) continue;
        let el = inp;
        for (let d = 0; d < 6 && el; d++) {
          const t = (el.textContent || '').trim();
          if (t.includes('产地') || t.includes('原产地')) {
            inp.focus();
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(inp, '中国大陆');
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            inp.dispatchEvent(new Event('blur', { bubbles: true }));
            return { success: true, method: 'fill' };
          }
          el = el.parentElement;
        }
      }
      return { success: false };
    });

    if (originResult.success && originResult.method === 'click') {
      filled.origin = true;
      console.log('[Taobao] ✓ Origin dropdown clicked');
      await page.waitForTimeout(1000);
      const firstOption = page.locator('[class*="option"], [class*="menu-item"], [class*="select-item"]').first();
      if (await firstOption.count() > 0 && await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await firstOption.click();
        console.log('[Taobao] ✓ Origin: selected first option');
      } else {
        await page.keyboard.type(DEFAULT_ORIGIN, { delay: 50 });
        await page.keyboard.press('Enter');
        console.log(`[Taobao] ✓ Origin: typed ${DEFAULT_ORIGIN}`);
      }
      await page.waitForTimeout(500);
      return;
    }
    if (originResult.success && originResult.method === 'fill') {
      filled.origin = true;
      console.log(`[Taobao] ✓ Origin: ${DEFAULT_ORIGIN}`);
      return;
    }

    // Strategy C: Playwright click label
    const originLabel = page.locator(':text("产地"), :text("原产地"), :text("货源地")').first();
    if (await originLabel.count() > 0 && await originLabel.isVisible({ timeout: 2000 }).catch(() => false)) {
      await originLabel.click();
      await page.waitForTimeout(600);
      const opts = page.locator('[class*="option"], [class*="menu-item"]');
      if (await opts.count() > 0) {
        await opts.first().click();
        filled.origin = true;
        console.log('[Taobao] ✓ Origin: selected option');
        return;
      }
      await page.keyboard.type(DEFAULT_ORIGIN, { delay: 50 });
      await page.keyboard.press('Enter');
      filled.origin = true;
      console.log(`[Taobao] ✓ Origin (playwright): ${DEFAULT_ORIGIN}`);
      return;
    }
    console.log('[Taobao] Origin fill failed');
  } catch (e) {
    console.log('[Taobao] Origin fill error:', e.message);
  }
}

/**
 * Fill freight template (运费模板). Based on diagnostic:
 * - Label text "运费模板" @ top=2623
 * - This is usually a click-to-select dropdown
 * Strategy: click the edit icon/button next to "运费模板", select first template
 */
async function fillFreight(page, filled) {
  console.log('[Taobao] Filling freight template...');
  try {
    // Diagnostic: "运费模板" label exists at top=2623
    // Try clicking the label or nearby button
    const freightLabels = ['运费模板', '运费', '物流'];
    for (const label of freightLabels) {
      const el = page.locator(`text="${label}"`).first();
      if (await el.count() > 0 && await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Click the label first to focus the section
        await el.click();
        await page.waitForTimeout(800);

        // Look for dropdown options that appeared
        const options = page.locator('[class*="option"], [class*="menu-item"], [class*="select-item"], li[class*="select"], .next-menu-item, .next-select-item');
        const optCount = await options.count();
        if (optCount > 0) {
          await options.first().click();
          await page.waitForTimeout(500);
          filled.freight = true;
          console.log('[Taobao] ✓ Freight template selected');
          return;
        }

        // If no dropdown, try clicking the parent container (might be a link/button)
        const parentBtn = el.locator('..').locator('a, button, [class*="edit"], [class*="btn"]').first();
        if (await parentBtn.count() > 0) {
          await parentBtn.click();
          await page.waitForTimeout(800);
          const opts2 = page.locator('[class*="option"], [class*="menu-item"], [class*="select-item"]');
          if (await opts2.count() > 0 && await opts2.first().isVisible({ timeout: 2000 }).catch(() => false)) {
            await opts2.first().click();
            filled.freight = true;
            console.log('[Taobao] ✓ Freight: selected via parent button');
            return;
          }
        }

        // Last resort: type "包邮"
        await page.keyboard.type('包邮', { delay: 50 });
        await page.keyboard.press('Enter');
        filled.freight = true;
        console.log('[Taobao] ✓ Freight (typed): 包邮');
        return;
      }
    }

    // Try clicking the edit area directly
    console.log('[Taobao] Freight: trying direct area click...');
    const freightArea = page.locator('[class*="freight"], [class*="Freight"], [class*="logistics"], [class*="Logistics"], [class*="delivery"]').first();
    if (await freightArea.count() > 0 && await freightArea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await freightArea.click();
      await page.waitForTimeout(800);
      const opts = page.locator('[class*="option"], [class*="menu-item"], [class*="select-item"], li[class*="select"]');
      if (await opts.count() > 0) {
        await opts.first().click();
        filled.freight = true;
        console.log('[Taobao] ✓ Freight: selected via area click');
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
export const x = 1;
