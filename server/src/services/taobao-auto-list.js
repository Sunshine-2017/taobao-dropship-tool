/**
 * Taobao auto-listing service via Playwright
 *
 * Architecture:
 * - launchContext(): persistent browser context with saved login
 * - searchAndSelectCategory(): find and select product category (fallback)
 * - fillForm(): fill title, price, stock on publish page
 * - uploadImagesViaIframe(): upload product images via iframe dialog
 * - submitAndVerify(): click submit and check success
 * - batchListToTaobao(): orchestrates the full flow
 *
 * Profile persistence mechanism:
 *   1. Before launch: copies taobao-profile → taobao-profile-playwright-copy
 *   2. Playwright writes session/cookies to the copy
 *   3. After batch completes: copies copy → taobao-profile (preserving login)
 *   4. Browser context is closed to flush all data
 */
import { chromium } from 'playwright';
import { join, resolve } from 'path';
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync, statSync, copyFileSync, cpSync } from 'fs';

// Use absolute paths to avoid cwd issues
const PROJECT_ROOT = resolve(join(import.meta.url.replace('file:///', ''), '..', '..', '..'));
const USER_DATA_DIR = process.env.TAOBAO_PROFILE_DIR || join(PROJECT_ROOT, 'data', 'taobao-profile');
const SCREENSHOT_DIR = join(PROJECT_ROOT, 'data', 'screenshots');
const LOG_DIR = join(PROJECT_ROOT, 'data', 'logs');

// Category catId map — for known categories, skip AI search and jump directly to publish page
const CATEGORY_CAT_IDS = {
  '花茶': '125242010',
  '药食同源': '125242011',
  '滋补品': '125242012',
  '茶叶': '125242013',
  '组合型花茶': '125242014',
  '食品': '125242015',
  '手机配件': '125242016',
  '收纳用品': '125242017',
  '其他': '50008168',
};

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
// Copy profile to avoid lock conflict with user's own Edge
function copyProfileSync(src, dst) {
  if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
  mkdirSync(dst, { recursive: true });
  // Copy top-level files and dirs (skip locks/crash files)
  const entries = readdirSync(src);
  for (const e of entries) {
    if (e === 'lockfile' || e === 'SingletonLock' || e === 'SingletonSocket' || e === 'SingletonCookie' || e === 'CrashpadMetrics-active.pma') continue;
    const s = join(src, e);
    const d = join(dst, e);
    try {
      if (statSync(s).isDirectory()) {
        cpSync(s, d, { recursive: true, force: true });
      } else {
        copyFileSync(s, d);
      }
    } catch {}
  }
}

async function launchContext() {
  const COPY_USER_DATA_DIR = USER_DATA_DIR + '-playwright-copy';

  // Clean old copy first
  if (existsSync(COPY_USER_DATA_DIR)) {
    try { rmSync(COPY_USER_DATA_DIR, { recursive: true, force: true }); } catch {}
  }

  // Copy profile if it exists (has content)
  if (existsSync(USER_DATA_DIR)) {
    const entries = readdirSync(USER_DATA_DIR);
    if (entries.length > 0) {
      copyProfileSync(USER_DATA_DIR, COPY_USER_DATA_DIR);
      console.log('[Taobao] Using profile copy:', COPY_USER_DATA_DIR);
    } else {
      mkdirSync(COPY_USER_DATA_DIR, { recursive: true });
      console.log('[Taobao] Profile dir empty, starting fresh');
    }
  } else {
    mkdirSync(USER_DATA_DIR, { recursive: true });
    mkdirSync(COPY_USER_DATA_DIR, { recursive: true });
    console.log('[Taobao] No profile dir, created fresh');
  }

  for (const dir of [SCREENSHOT_DIR, LOG_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  // Clean stale lock files
  for (const lock of ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'lockfile']) {
    try { rmSync(join(USER_DATA_DIR, lock), { recursive: true, force: true }); } catch {}
  }

  // Use system browser channel (chrome/msedge) to reuse login cookies
  // Set env BROWSER_CHANNEL=msedge to use Edge, BROWSER_CHANNEL=chrome for Chrome
  // Set USE_CHROME_CHANNEL=false to use Playwright's built-in Chromium
  const browserChannel = process.env.BROWSER_CHANNEL || 'msedge';
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

  const context = await chromium.launchPersistentContext(COPY_USER_DATA_DIR, launchOpts);

  console.log('[Taobao] Browser launched successfully');
  return context;
}

// ============================================================
// Profile persistence — copy Playwright's changes back
// ============================================================
/**
 * After Playwright finishes, copy the updated copy dir back to the canonical
 * taobao-profile dir so login state persists across runs.
 */
function copyProfileBack() {
  const COPY_USER_DATA_DIR = USER_DATA_DIR + '-playwright-copy';
  if (!existsSync(COPY_USER_DATA_DIR)) {
    console.log('[Taobao] No playwright-copy to sync back');
    return;
  }
  const entries = readdirSync(COPY_USER_DATA_DIR);
  if (entries.length < 2) {
    console.log('[Taobao] Playwright-copy is empty, skipping sync');
    return;
  }

  // Wipe canonical dir and replace with copy
  if (existsSync(USER_DATA_DIR)) {
    try { rmSync(USER_DATA_DIR, { recursive: true, force: true }); } catch {}
  }
  try {
    cpSync(COPY_USER_DATA_DIR, USER_DATA_DIR, { recursive: true, force: true });
    console.log('[Taobao] ✓ Profile synced back to taobao-profile');
  } catch (e) {
    console.log('[Taobao] Profile sync error:', e.message);
  }
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
    { keywords: ['花茶', '菊花', '玫瑰', '茉莉', '桂花', '洛神', '花草', '金丝皇菊'], category: '花茶' },
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
    } else {
      console.log('[Taobao] "搜索发品" tab not found');
      await logStep(page, 'no-search-tab', 'debug', { body: await page.evaluate(() => document.body?.innerText?.substring(0,200) || '') });
    }
  } catch (e) {
    console.log('[Taobao] Search tab click error:', e.message);
  }

  // Step 2: Find and fill search input
  await page.waitForTimeout(1000);
  // Use the precise placeholder that matches the category search input
  const searchInput = page.locator([
    'input[placeholder*="可输入"]',
    'input[placeholder*="产品名称"]',
    'input[placeholder*="类目关键词"]',
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):visible',
  ].join(',')).first();
  if (await searchInput.count() === 0) {
    console.log('[Taobao] ⛔ No input found on page. Dumping body...');
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '(empty body)');
    console.log('[Taobao] Body:', bodyText);
    await page.screenshot({ path: join(SCREENSHOT_DIR, "no_cat_input.png"), fullPage: true });
    return false;
  }
  console.log('[Taobao] Typing category keyword: "' + cat + '"');

  // Diagnostic: what input did we find?
  const inputInfo = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input:not([type="hidden"])');
    return Array.from(inputs).slice(0, 5).map(i => ({
      placeholder: i.placeholder,
      id: i.id,
      className: (i.className || '').substring(0, 40),
      w: Math.round(i.getBoundingClientRect().width),
      top: Math.round(i.getBoundingClientRect().top),
      parentText: ((i.parentElement?.textContent || '').trim().substring(0, 40))
    }));
  });
  console.log('[Taobao] Inputs on page:', JSON.stringify(inputInfo));

  // Type keyword using Playwright, with slow typing to trigger React
  await searchInput.click();
  await page.waitForTimeout(300);
  await searchInput.fill(cat);
  await page.waitForTimeout(500);

  // Press Tab to trigger blur/change events, then Enter
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);

  // Also try clicking the search button/text
  await page.evaluate(() => {
    const items = document.querySelectorAll('button, a, span');
    for (const el of items) {
      const t = (el.textContent || '').trim();
      if (t === '搜索' && el.offsetParent !== null && el.tagName !== 'SPAN') {
        el.click();
        return;
      }
    }
  });
  await page.waitForTimeout(500);

  console.log('[Taobao] Search submitted, waiting 4s for results...');
  await page.waitForTimeout(4000);

  // Log page items after search
  try {
    const pageItems = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.sell-rich-text.path-text, [class*="category"], [class*="result"], a, li, td, span'))
        .slice(0, 20)
        .map(el => (el.textContent || '').trim())
        .filter(t => t.length > 0 && t.length < 100)
        .slice(0, 15);
    });
    if (pageItems.length > 0) console.log('[Taobao] Items on page:', JSON.stringify(pageItems));
    else console.log('[Taobao] No text items found on page');
  } catch(e) { console.log('[Taobao] Page eval error:', e.message); }
  await page.screenshot({ path: join(SCREENSHOT_DIR, `after_cat_search_${Date.now()}.png`), fullPage: false });

  // Step 3: Click the first matching category result
  try {
    const results = page.locator([
    '.sell-rich-text',
    '[class*="category"]',
    '[class*="result"]',
    'table a',
    'li',
    '.next-table-row',
    'tr[data-value]',
    '.path-text',
    '.leaf-node',
    'div.category-list',
    '.next-tree-node',
  ].join(','));
    const count = await results.count();
    if (count === 0) {
      console.log('[Taobao] No category results found');
      return false;
    }

    console.log(`[Taobao] Found ${count} category results`);

    // Try to find best match
    let target = null;
    const catLower = cat.toLowerCase();

    // First pass: any match containing the cat keyword (flexible)
    for (let i = 0; i < Math.min(count, 30); i++) {
      const txt = await results.nth(i).textContent().catch(() => '');
      const cleanTxt = txt.trim();
      if (!cleanTxt || cleanTxt.length > 60) continue;
      console.log(`[Taobao] [${i}]: "${cleanTxt}"`);

      // Check if this element contains our cat keyword
      if (cleanTxt.includes(cat) || cat.includes(cleanTxt)) {
        target = results.nth(i);
        console.log(`[Taobao] Good match: "${cleanTxt}"`);
        break;
      }
    }



    // Third pass: pick the first result — but log a warning
    if (!target) {
      console.log(`[Taobao] ⚠ No good match found for "${cat}" among ${count} results. Picking first result.`);
      target = results.first();
    }


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

  // ---- DEBUG: Dump all input elements on page ----
  console.log('[Taobao] DEBUG: Dumping all visible inputs...');
  const inputsDebug = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input:not([type="hidden"])');
    const results = [];
    for (const inp of inputs) {
      const r = inp.getBoundingClientRect();
      if (r.width < 10 || r.height < 5) continue;
      const container = inp.closest('[class*="form"],[class*="Form"],[class*="item"],[class*="Item"],[class*="field"],[class*="Field"]');
      const parentText = (container?.textContent || inp.parentElement?.parentElement?.textContent || inp.parentElement?.textContent || '').trim().substring(0, 100);
      const prevEl = inp.previousElementSibling;
      const prevText = (prevEl?.textContent || '').trim().substring(0, 40);
      results.push({
        top: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
        placeholder: (inp.placeholder || '').substring(0, 40),
        value: (inp.value || '').substring(0, 20),
        prevText,
        parentText: parentText.substring(0, 120),
      });
    }
    return results;
  });
  console.log('[Taobao] DEBUG inputs list:');
  for (const d of inputsDebug) {
    console.log(JSON.stringify(d));
  }
  // ---- End DEBUG ----


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
      const titleInput = page.locator('input[placeholder*="60个汉字"], input[placeholder*="60字符"], input[placeholder*="最多允许输入"]').first();
      if (await titleInput.count() > 0) {
        await titleInput.click();
        await page.waitForTimeout(300);
        await titleInput.fill(title);
        filled.title = true;
        console.log('[Taobao] Title (playwright fill): ' + title);
        return;
      }
      const allInputs = page.locator('input:visible:not([type="hidden"])');
      const ic = await allInputs.count();
      for (let i = 0; i < ic; i++) {
        const inp = allInputs.nth(i);
        const box = await inp.boundingBox().catch(() => null);
        if (!box || box.width < 400 || box.width > 900 || box.y < 0 || box.y > 300) continue;
        const placeholder = await inp.getAttribute("placeholder").catch(() => "");
        if (placeholder && (placeholder.includes("60") || placeholder.includes("标题") || placeholder.includes("宝贝"))) {
          await inp.click();
          await page.waitForTimeout(300);
          await inp.fill(title);
          filled.title = true;
          console.log('[Taobao] Title (playwright fallback): ' + title);
          return;
        }
      }
      console.log("[Taobao] Title input not found");
    } catch (e) {
      console.log("[Taobao] Title fill error:", e.message);
    }
  }
  
  async function fillPrice(page, price, filled) {
  console.log('[Taobao] Filling price: ' + price);
  // INPUT DIAGNOSTIC: dump all visible inputs
  try {
    const diag = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input:not([type="hidden"])')).map(inp => ({
        id: inp.id,
        placeholder: inp.placeholder,
        className: (inp.className || '').substring(0, 60),
        width: Math.round(inp.getBoundingClientRect().width),
        top: Math.round(inp.getBoundingClientRect().top),
        parents: (() => {
          let el = inp.parentElement;
          const texts = [];
          for (let i = 0; i < 5 && el; i++) {
            texts.push((el.textContent || '').trim().substring(0, 60));
            el = el.parentElement;
          }
          return texts;
        })()
      }));
    });
    console.log('[Taobao] INPUT DIAGNOSTIC:', JSON.stringify(diag, null, 2));
  } catch(e) {
    console.log('[Taobao] INPUT DIAG error:', e.message);
  }

  try {
    const priceResult = await page.evaluate(({ priceVal }) => {
      const container = document.querySelector('#sell-field-price');
      if (container) {
        const inp = container.querySelector('input:not([type="hidden"]):not([type="radio"])');
        if (inp) {
          const r = inp.getBoundingClientRect();
          if (r.width > 20 && r.height > 8) {
            inp.focus();
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(inp, String(priceVal));
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, method: 'id', value: inp.value };
          }
        }
      }

      const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="radio"])');
      for (const inp of inputs) {
        const r = inp.getBoundingClientRect();
        if (r.width < 20 || r.height < 8) continue;
        var allText = '';
        var el = inp;
        for (var d = 0; d < 10 && el; d++) {
          var t = (el.textContent || '').trim();
          if (t) allText += '|' + t;
          el = el.parentElement;
        }
        if (allText.includes('一口价') && allText.includes('|元|')) {
          inp.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(inp, String(priceVal));
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, method: 'walk', value: inp.value };
        }
      }
      return { success: false };
    }, { priceVal: price });

    if (priceResult.success) {
      filled.price = true;
      console.log('[Taobao] ✓ Price: ' + price + ' (' + priceResult.method + ')');
    } else {
      const allInputs = page.locator('input:visible:not([type="hidden"])');
      const ic = await allInputs.count();
      for (let i = 0; i < ic; i++) {
        const inp = allInputs.nth(i);
        const parentText = await inp.evaluate(el => {
          var text = '';
          var p = el;
          for (var d = 0; d < 10 && p; d++) {
            var t = (p.textContent || '').trim();
            if (t) text += '|' + t;
            p = p.parentElement;
          }
          return text;
        });
        if (parentText.includes('一口价')) {
          const box = await inp.boundingBox().catch(() => null);
          if (box && box.width > 20) {
            await inp.click();
            await inp.fill(String(price));
            filled.price = true;
            console.log('[Taobao] ✓ Price (playwright): ' + price);
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
      const container = document.querySelector('#sell-field-quantity');
      if (container) {
        const inp = container.querySelector('input:not([type="hidden"]):not([type="radio"])');
        if (inp) {
          const r = inp.getBoundingClientRect();
          if (r.width > 20 && r.height > 8) {
            inp.focus();
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(inp, '9999');
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, method: 'id', value: inp.value };
          }
        }
      }

      const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="radio"])');
      for (const inp of inputs) {
        const r = inp.getBoundingClientRect();
        if (r.width < 20 || r.height < 8) continue;
        var allText = '';
        var el = inp;
        for (var d = 0; d < 10 && el; d++) {
          var t = (el.textContent || '').trim();
          if (t) allText += '|' + t;
          el = el.parentElement;
        }
        if (allText.includes('总库存') && allText.includes('|件|')) {
          inp.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(inp, '9999');
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, method: 'walk', value: inp.value };
        }
      }
      return { success: false };
    });

    if (stockResult.success) {
      filled.qty = true;
      console.log('[Taobao] ✓ Stock: 9999 (' + stockResult.method + ')');
    } else {
      const allInputs = page.locator('input:visible:not([type="hidden"])');
      const ic = await allInputs.count();
      for (let i = 0; i < ic; i++) {
        const inp = allInputs.nth(i);
        const parentText = await inp.evaluate(el => {
          var text = '';
          var p = el;
          for (var d = 0; d < 10 && p; d++) {
            var t = (p.textContent || '').trim();
            if (t) text += '|' + t;
            p = p.parentElement;
          }
          return text;
        });
        if (parentText.includes('总库存')) {
          const box = await inp.boundingBox().catch(() => null);
          if (box && box.width > 20) {
            await inp.click();
            await inp.fill('9999');
            filled.qty = true;
            console.log('[Taobao] ✓ Stock (playwright): 9999');
            break;
          }
        }
      }
    }
  } catch (e) {
    console.log('[Taobao] Stock fill error:', e.message);
  }
}

/**
 * Fill brand field. Uses page.evaluate to deeply inspect the DOM and find the
 * correct element by label text proximity. This is more reliable than CSS selectors
 * on Taobao's complex SPA publish page.
 */
async function fillBrand(page, filled) {
  console.log('[Taobao] Filling brand...');
  try {
    const result = await page.evaluate(async () => {
      // Find all input-like elements near "品牌" label
      const walkText = (el, depth) => {
        if (depth > 8 || !el) return '';
        let t = (el.textContent || '').trim();
        if (t) return t;
        return walkText(el.parentElement, depth + 1);
      };

      // Look for the brand container — usually a div with label "品牌"
      const allElements = document.querySelectorAll('div, span, label, fieldset, section');
      for (const el of allElements) {
        const txt = (el.textContent || '').trim();
        if (txt === '品牌' || txt === '品牌*' || txt === '*品牌') {
          // Found brand label — look for nearby input/dropdown
          let container = el.parentElement;
          for (let d = 0; d < 6 && container; d++) {
            // Check for Ant Design/Fusion select
            const selectTrigger = container.querySelector('[class*="next-select-trigger"], [class*="ant-select-selector"], [class*="select-trigger"], [class*="dropdown-trigger"]');
            if (selectTrigger) {
              selectTrigger.click();
              return { success: true, method: 'click-trigger' };
            }
            // Check for input
            const inp = container.querySelector('input:not([type="hidden"])');
            if (inp) {
              const r = inp.getBoundingClientRect();
              if (r.width > 20) {
                inp.focus();
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(inp, '其他');
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                return { success: true, method: 'input-set-其他' };
              }
            }
            container = container.parentElement;
          }
        }
      }
      return { success: false };
    });

    if (result.success) {
      filled.brand = true;
      await page.waitForTimeout(1000);
      // Try to select first option from dropdown that appeared
      try {
        const firstOpt = page.locator('[class*="next-menu-item"], [class*="ant-select-item-option"], [class*="select-option"]').first();
        if (await firstOpt.count() > 0) {
          await firstOpt.click().catch(() => {});
        } else {
          await page.keyboard.press('Enter');
        }
      } catch {}
      console.log('[Taobao] ✓ Brand filled (' + result.method + ')');
    } else {
      console.log('[Taobao] Brand not found');
    }
  } catch (e) {
    console.log('[Taobao] Brand fill error:', e.message);
  }
}

async function fillPackaging(page, filled) {
  console.log('[Taobao] Filling packaging...');
  try {
    const result = await page.evaluate(async () => {
      const allElements = document.querySelectorAll('div, span, label, fieldset, section');
      for (const el of allElements) {
        const txt = (el.textContent || '').trim();
        if (txt === '包装方式' || txt === '包装方式*' || txt.includes('包装方式')) {
          // Look for a select trigger nearby
          let container = el.parentElement;
          for (let d = 0; d < 6 && container; d++) {
            const selectTrigger = container.querySelector('[class*="next-select-trigger"], [class*="ant-select-selector"], [class*="select-trigger"], [class*="dropdown-trigger"]');
            if (selectTrigger) {
              selectTrigger.click();
              return { success: true, method: 'click-trigger' };
            }
            const inp = container.querySelector('input:not([type="hidden"])');
            if (inp) {
              const r = inp.getBoundingClientRect();
              if (r.width > 20) {
                inp.focus();
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(inp, '袋装');
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                return { success: true, method: 'input-袋装' };
              }
            }
            container = container.parentElement;
          }
        }
      }
      return { success: false };
    });

    if (result.success) {
      filled.packaging = true;
      await page.waitForTimeout(1000);
      try {
        const firstOpt = page.locator('[class*="next-menu-item"], [class*="ant-select-item-option"], [class*="select-option"]').first();
        if (await firstOpt.count() > 0) {
          await firstOpt.click().catch(() => {});
        } else {
          await page.keyboard.press('Enter');
        }
      } catch {}
      console.log('[Taobao] ✓ Packaging filled (' + result.method + ')');
    } else {
      console.log('[Taobao] Packaging not found');
    }
  } catch (e) {
    console.log('[Taobao] Packaging fill error:', e.message);
  }
}

async function fillOrigin(page, filled) {
  console.log('[Taobao] Filling origin...');
  try {
    const result = await page.evaluate(async () => {
      const allElements = document.querySelectorAll('div, span, label, fieldset, section');
      for (const el of allElements) {
        const txt = (el.textContent || '').trim();
        if (txt === '产地' || txt === '产地*' || txt.includes('产地')) {
          let container = el.parentElement;
          for (let d = 0; d < 6 && container; d++) {
            const selectTrigger = container.querySelector('[class*="next-select-trigger"], [class*="ant-select-selector"], [class*="select-trigger"], [class*="dropdown-trigger"]');
            if (selectTrigger) {
              selectTrigger.click();
              return { success: true, method: 'click-trigger' };
            }
            const inp = container.querySelector('input:not([type="hidden"])');
            if (inp) {
              const r = inp.getBoundingClientRect();
              if (r.width > 20) {
                inp.focus();
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(inp, '安徽');
                inp.dispatchEvent(new Event('input', { bubbles: true }));
                inp.dispatchEvent(new Event('change', { bubbles: true }));
                return { success: true, method: 'input-安徽' };
              }
            }
            container = container.parentElement;
          }
        }
      }
      return { success: false };
    });

    if (result.success) {
      filled.origin = true;
      await page.waitForTimeout(1000);
      try {
        const firstOpt = page.locator('[class*="next-menu-item"], [class*="ant-select-item-option"], [class*="select-option"]').first();
        if (await firstOpt.count() > 0) {
          await firstOpt.click().catch(() => {});
        } else {
          await page.keyboard.press('Enter');
        }
      } catch {}
      console.log('[Taobao] ✓ Origin filled (' + result.method + ')');
    } else {
      console.log('[Taobao] Origin not found');
    }
  } catch (e) {
    console.log('[Taobao] Origin fill error:', e.message);
  }
}

async function fillFreight(page, filled) {
  console.log('[Taobao] Filling freight template...');
  try {
    const result = await page.evaluate(async () => {
      const allElements = document.querySelectorAll('div, span, label, fieldset, section');
      for (const el of allElements) {
        const txt = (el.textContent || '').trim();
        if (txt === '运费模板' || txt === '运费模板*' || txt.includes('运费模板') || txt.includes('物流')) {
          let container = el.parentElement;
          for (let d = 0; d < 6 && container; d++) {
            // Try clicking the container itself first
            const clickable = container.querySelector('a, button, [class*="edit"], [class*="btn"], [class*="select"], [class*="picker"]');
            if (clickable) {
              clickable.click();
              return { success: true, method: 'click-edit' };
            }
            const selectTrigger = container.querySelector('[class*="next-select-trigger"], [class*="ant-select-selector"]');
            if (selectTrigger) {
              selectTrigger.click();
              return { success: true, method: 'click-trigger' };
            }
            container = container.parentElement;
          }
        }
      }
      return { success: false };
    });

    if (result.success) {
      filled.freight = true;
      await page.waitForTimeout(1000);
      try {
        const firstOpt = page.locator('[class*="next-menu-item"], [class*="ant-select-item-option"], [class*="select-option"]').first();
        if (await firstOpt.count() > 0) {
          await firstOpt.click().catch(() => {});
        } else {
          await page.keyboard.press('Enter');
        }
      } catch {}
      console.log('[Taobao] ✓ Freight filled (' + result.method + ')');
    } else {
      console.log('[Taobao] Freight not found');
    }
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
// Image upload — Taobao publish page
// ============================================================
/**
 * Upload images to the Taobao publish page.
 *
 * Taobao's image upload flow (observed on v2 publish page):
 *   1. There's a grid of upload slots (class ~ "material-item-view" or similar)
 *   2. Clicking a slot opens the image picker dialog (iframe: sucai-selector-ng)
 *   3. Inside the iframe, click "本地上传" → file chooser opens
 *   4. After selecting file, the image uploads and a thumbnail appears
 *   5. Click "完成" to apply
 *
 * Strategy A: Direct file input via Playwright fileChooser
 *   - Set up fileChooser listener, click upload button that triggers it
 *
 * Strategy B: Find hidden <input type="file"> and set its files
 *
 * Strategy C: Use the iframe approach — navigate the sucai-selector-ng iframe
 */
async function uploadImagesViaIframe(page, imagePaths) {
  const downloadDir = join(PROJECT_ROOT, 'data', 'temp-images');
  if (!existsSync(downloadDir)) mkdirSync(downloadDir, { recursive: true });

  console.log('[Taobao] Uploading ' + imagePaths.length + ' images...');

  // Download remote images to local
  const localPaths = [];
  for (const imgPath of imagePaths) {
    if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
      try {
        const response = await fetch(imgPath);
        const buffer = Buffer.from(await response.arrayBuffer());
        const ext = (imgPath.split('.').pop() || 'jpg').split('?')[0];
        const local = join(downloadDir, 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext);
        writeFileSync(local, buffer);
        localPaths.push(local);
      } catch (e) {
        console.log('[Taobao] Failed to download ' + imgPath + ': ' + e.message);
      }
    } else {
      localPaths.push(imgPath);
    }
  }

  if (localPaths.length === 0) {
    console.log('[Taobao] No valid images to upload');
    return;
  }

  console.log('[Taobao] Downloaded ' + localPaths.length + ' images to ' + downloadDir);

  // ── Strategy A: page.evaluate() DOM traversal to find upload elements ──
  // Taobao publish page uses dynamically generated DOM. We need to search inside
  // to find the image upload area and its slots.
  let uploaded = 0;
  for (let i = 0; i < Math.min(localPaths.length, 10); i++) {
    const localPath = localPaths[i];
    if (!existsSync(localPath)) continue;

    try {
      // Step 1: Click an upload slot via DOM evaluation
      console.log('[Taobao] Uploading image ' + (i + 1) + '/' + localPaths.length);
      const clickResult = await page.evaluate(async (slotIndex) => {
        // Look for image upload slots — various known Taobao patterns
        const selectors = [
          '.sell-component-material-item-view',
          '[class*="material-item-view"]',
          '[class*="upload-picture-item"]',
          '[class*="image-uploader"]',
          '.ant-upload-select',
          '[class*="ant-upload"]',
          '.next-upload',
          '[class*="next-upload"]',
        ];

        for (const sel of selectors) {
          const items = document.querySelectorAll(sel);
          if (items.length > slotIndex) {
            const target = items[slotIndex];
            // Check not already filled
            if (!target.querySelector('img')) {
              target.click();
              return { clicked: true, selector: sel };
            }
          }
        }
        return { clicked: false };
      }, i);

      if (!clickResult.clicked) {
        console.log('[Taobao] No upload slot found for image ' + (i + 1));
      }
      await page.waitForTimeout(2000);

      // Step 2: Set up fileChooser event
      const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 15000 }).catch(() => null);

      // Step 3: Click "本地上传" button — look in main page and iframes
      const uploadClickResult = await page.evaluate(() => {
        // Try clicking text "本地上传" in the page
        const allEls = document.querySelectorAll('button, a, span, div, li');
        for (const el of allEls) {
          const t = (el.textContent || '').trim();
          if (t === '本地上传' || t === '上传图片') {
            if (el.offsetParent !== null) {
              el.click();
              return true;
            }
          }
        }
        return false;
      });

      if (!uploadClickResult) {
        // Try in iframes
        const frames = page.frames();
        for (const frame of frames) {
          const url = frame.url();
          if (url.includes('sucai') || url.includes('upload') || url.includes('material') || url.includes('image') || url.includes('taobao')) {
            try {
              const clicked = await frame.evaluate(() => {
                const allEls = document.querySelectorAll('button, a, span, div, li');
                for (const el of allEls) {
                  const t = (el.textContent || '').trim();
                  if (t === '本地上传' || t === '上传图片') {
                    if (el.offsetParent !== null) {
                      el.click();
                      return true;
                    }
                  }
                }
                return false;
              });
              if (clicked) {
                console.log('[Taobao] Clicked upload in iframe: ' + url.substring(0, 60));
                break;
              }
            } catch {}
          }
        }
      }

      // Step 4: Wait for fileChooser or try direct file input
      let fc = await fileChooserPromise;
      if (fc) {
        await fc.setFiles(localPath);
        await page.waitForTimeout(3000);
        uploaded++;
        console.log('[Taobao] ✓ Image ' + (i + 1) + ' via fileChooser');
      } else {
        // Try direct file input via DOM
        const fileInputResult = await page.evaluate(async (path) => {
          // Try to find any file input
          const fileInputs = document.querySelectorAll('input[type="file"]');
          if (fileInputs.length > 0) {
            // Can't set files from evaluate due to security restrictions
            return { found: fileInputs.length, canSet: false };
          }
          // Try iframes
          return { found: 0 };
        }, localPath);

        if (fileInputResult.found > 0) {
          // Use Playwright's setInputFiles on the first file input
          const fi = page.locator('input[type="file"]').first();
          if (await fi.count() > 0) {
            await fi.setInputFiles(localPath);
            await page.waitForTimeout(3000);
            uploaded++;
            console.log('[Taobao] ✓ Image ' + (i + 1) + ' via direct file input');
          }
        } else {
          console.log('[Taobao] ✗ Image ' + (i + 1) + ' — no upload mechanism');
        }
      }

      // Close dialog
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(500);
    } catch (e) {
      console.log('[Taobao] Upload error for image ' + i + ': ' + e.message);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  console.log('[Taobao] Image upload complete: ' + uploaded + '/' + Math.min(localPaths.length, 10) + ' uploaded');

  // Cleanup temp files
  for (const lp of localPaths) {
    if (existsSync(lp)) {
      try { rmSync(lp); } catch {}
    }
  }
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
export async function batchListToTaobao(products, overrideCategory, overridePrices, options = {}) {
  const { onProgress } = options;
  const _progress = (msg) => { if (onProgress) onProgress(msg); };

  _progress(`启动浏览器: ${products.length} 件商品`);
  console.log(`[Taobao] Starting batch listing ${products.length} products...`);

  const context = await launchContext();
  const page = context.pages()[0] || await context.newPage();

  _progress('浏览器已启动，正在检查登录状态...');
  // Login check — wait for redirects to settle
  console.log('[Taobao] Checking login status...');
  const loginErr2 = await page.goto('https://qn.taobao.com/home.html/SellManage/on_sale?current=1&pageSize=20', {
    waitUntil: 'domcontentloaded', timeout: 30000,
  }).catch(e => e);
  if (loginErr2) console.log('[Taobao] Navigation error:', loginErr2.message);

  // Wait for redirect chain (qn -> login or seller)
  await page.waitForTimeout(5000);
  const finalUrl2 = page.url();
  console.log('[Taobao] Final URL after login check:', finalUrl2);

  const isLoggedIn2 = (finalUrl2.includes('myseller.taobao.com') && !finalUrl2.includes('login')) || finalUrl2.includes('item.upload.taobao.com') || finalUrl2.includes('qn.taobao.com/home.html/SellManage');

  if (!isLoggedIn2) {
    if (finalUrl2.includes('login') || finalUrl2.includes('passport')) {
      console.log('[Taobao] Login required - please scan QR code...');
      _progress('⏳ 需要扫码登录淘宝，请在打开浏览器中扫码...');
    }
    try {
      await page.waitForFunction(() => {
        const u = window.location.href;
        return u.includes('myseller.taobao.com') || u.includes('item.upload.taobao.com');
      }, { timeout: 300000, polling: 3000 });
      await page.waitForTimeout(3000);
      console.log('[Taobao] Login completed');
      _progress('✓ 登录成功！');
    } catch(e) {
      console.log('[Taobao] Login timeout:', e.message);
    }
  } else {
    console.log('[Taobao] Already logged in');
    _progress('✓ 已登录');
  }

  _progress('开始处理商品...');

// Process each product
  const results = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const title = p.title || '';
    // Use user-specified price if provided, otherwise fall back to product's selling_price or cost_price
    const price = (overridePrices && overridePrices[p.id]) || p.selling_price || p.cost_price || 0;
    // If overrideCategory contains a path like "茶>代用/花草/水果/再加工茶>组合型花茶", extract the last segment
    let cat = overrideCategory || resolveCategory(p);
    if (cat.includes('>')) {
      // Store the FULL path — we'll use it for AI category search, not just leaf
      console.log(`[Taobao] Full category path: "${cat}"`);
    }
    initLog(`product_${p.id}_${Date.now()}`);
    console.log(`\n[Taobao] (${i + 1}/${products.length}) ${title} [类目: ${cat}]`);
    _progress(`[${i + 1}/${products.length}] ${title.substring(0, 30)}...`);

    const productResult = { id: p.id, title, success: false, message: '' };

    try {
      // Strategy: If user provided category path, use AI category search with the
      // full path as the search keyword (e.g., "汽车零部件/养护/美容/维保>>阿里车码头汽车服务>>全车检测服务")
      // This is more reliable than trying to map to a hardcoded catId.
      // The path segments are used as search keywords in sequence.
      const useCategorySearch = cat.includes('>') || !CATEGORY_CAT_IDS[cat];
      let catOk = false;

      if (useCategorySearch) {
        console.log(`[Taobao] Using AI category search for "${cat}"...`);
        _progress(`搜索淘宝类目: ${cat}...`);
        await page.goto('https://item.upload.taobao.com/sell/ai/category.htm?force=true', {
          waitUntil: 'domcontentloaded', timeout: 30000,
        }).catch(e => console.log('[Taobao] Category page nav error:', e.message));
        await page.waitForTimeout(3000);

        // Try search with various keywords derived from the category path
        // If path is "汽车零部件/养护/美容/维保>>阿里车码头汽车服务>>全车检测服务"
        // Try: "全车检测服务" (leaf) then "阿里车码头" then "汽车零部件"
        const catSegments = cat.split('>').map(s => s.trim()).filter(Boolean);
        const searchKeywords = [
          catSegments[catSegments.length - 1],                             // leaf
          catSegments.length > 1 ? catSegments[catSegments.length - 2] : '', // parent
          catSegments[0],                                                   // root
        ].filter(Boolean);

        for (const kw of searchKeywords) {
          console.log(`[Taobao] AI search with keyword: "${kw}"`);
          catOk = await searchAndSelectCategory(page, kw);
          if (catOk) {
            console.log(`[Taobao] ✓ Category found with keyword: "${kw}"`);
            break;
          }
        }
      } else {
        // Direct catId jump (only for known categories)
        const catId = CATEGORY_CAT_IDS[cat];
        console.log(`[Taobao] Skipping AI search, using catId=${catId} for "${cat}"`);
        _progress(`跳转到淘宝发布页 (类目: ${cat})...`);
        await page.goto(`https://item.upload.taobao.com/sell/v2/publish.htm?catId=${catId}&fromAICategory=true`, {
          waitUntil: 'domcontentloaded', timeout: 30000,
        }).catch(e => console.log('[Taobao] Publish nav error:', e.message));
        await page.waitForTimeout(8000);
        const pubUrl = page.url();
        catOk = pubUrl.includes('publish') && !pubUrl.includes('category');
      }

      // Fill form only if on publish page
      const currentUrl = page.url();
      if (currentUrl.includes('publish') && !currentUrl.includes('category')) {
        _progress('正在填写商品信息（标题/价格/库存/品牌等）...');
        let fillResult = { title: false, price: false, qty: false };
        try {
          fillResult = await withTimeout(fillForm(page, title, price, p.description || '', p), 60000, '表单填写');
        } catch (e) {
          console.log('[Taobao] fillForm error:', e.message);
          await logStep(page, 'form-error', 'timeout', { error: e.message });
        }
        await logStep(page, 'form-done', fillResult.title && fillResult.price ? 'ok' : 'partial', fillResult);
        console.log(`[Taobao] Form: title=${fillResult.title} price=${fillResult.price} qty=${fillResult.qty}`);

        _progress('正在提交到淘宝...');
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
          _progress(`✓ 上架成功: ${title.substring(0, 24)}`);
        } else {
          console.log(`[Taobao] ✗ Failed: ${title} — ${submitResult.message}`);
          _progress(`✗ 上架失败: ${title.substring(0, 20)} — ${submitResult.message.substring(0, 30)}`);
        }
      } else {
        console.log(`[Taobao] Not on publish page: ${currentUrl}`);
        productResult.message = '未到达发布页面，请检查类目选择';
      }

      // Log category status
      await logStep(page, 'category-done', catOk ? 'success' : 'failed', { cat, url: page.url() });
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

  // Close browser context to flush state
  try {
    await context.close();
    console.log('[Taobao] Browser context closed');
  } catch (e) {
    console.log('[Taobao] Browser close error:', e.message);
  }

  // Sync profile data back so login persists
  copyProfileBack();

  return {
    success: successCount > 0,
    message: `${successCount}/${products.length} 件商品上架成功`,
    results,
  };
}