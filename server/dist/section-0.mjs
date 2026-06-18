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
export const marker = 0;
