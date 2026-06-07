import { chromium } from 'playwright';
import { join } from 'path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';

const USER_DATA_DIR = join(process.cwd(), 'data', 'taobao-profile');
const SCREENSHOT_DIR = join(process.cwd(), 'data', 'screenshots');
const LOG_DIR = join(process.cwd(), 'data', 'logs');

// Structured log: screenshot + JSON status paired by timestamp prefix
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
    writeFileSync(join(LOG_DIR, `${fname}.json`), JSON.stringify(entry, null, 2));
    if (page) await page.screenshot({ path: join(LOG_DIR, `${fname}.png`), fullPage: false }).catch(() => {});
  } catch {}
}

async function launchContext() {
  if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });
  if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
  const profileDir = USER_DATA_DIR;
  if (!existsSync(profileDir)) mkdirSync(profileDir, { recursive: true });

  // Clean any leftover lock files in the base dir
  for (const lock of ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'lockfile']) {
    try { rmSync(join(USER_DATA_DIR, lock), { recursive: true, force: true }); } catch {}
  }

  console.log('[Taobao] Launching browser...');

  const context = await chromium.launchPersistentContext(profileDir, {
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
    ],
  });

  console.log('[Taobao] Browser launched successfully');
  return context;
}

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

  if (page.url().includes('login') || page.url().includes('passport')) {
    console.log('[Taobao] Please log in by scanning QR code...');
    try {
      // Wait until we reach the seller center home page after login
      await page.waitForFunction(
        () => {
          const u = window.location.href;
          // Consider logged in when we reach myseller or a page without login/passport
          if (u.includes('myseller.taobao.com')) return true;
          if (u.includes('item.upload.taobao.com')) return true;
          // Only return false if still clearly on a login/auth page
          return !u.includes('login.taobao.com') && !u.includes('passport') && !u.includes('oauth');
        },
        { timeout: 300000, polling: 3000 }
      );
      await page.waitForTimeout(3000); // Let the page stabilize after redirect
      console.log('[Taobao] Login completed, current page:', page.url());
    } catch (e) { console.log('[Taobao] Login timeout:', e.message); }
  } else {
    console.log('[Taobao] Already logged in');
  }

  // Process products
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const title = p.title || '';
    const price = p.selling_price || p.cost_price || 0;
    const cat = p.category || '花茶';
    initLog(`product_${p.id}_${Date.now()}`);
    console.log(`\n[Taobao] (${i + 1}/${products.length}) ${title}`);

    const navErr = await page.goto('https://item.upload.taobao.com/sell/ai/category.htm?force=true', {
      waitUntil: 'domcontentloaded', timeout: 30000,
    }).catch(e => e);
    if (navErr) console.log('[Taobao] Navigation error:', navErr.message);
    await page.waitForSelector('body', { timeout: 5000 }).catch(() => {});
    console.log(`[Taobao] Current URL: ${page.url()}`);

    await logStep(page, 'enter-search', 'ok', { title, cat });
    const catOk = await searchAndSelectCategory(page, cat);
    await logStep(page, 'category-done', catOk ? 'success' : 'failed', { cat });
    if (!catOk) {
      console.log('[Taobao] Category selection failed, waiting for redirect...');
      try {
        await page.waitForFunction(
          () => {
            const u = window.location.href;
            return u.includes('publish') && !u.includes('category') && !u.includes('router');
          },
          { timeout: 120000, polling: 2000 }
        );
      } catch (e) { console.log('[Taobao] Redirect timeout:', e.message); }
    }

    // Fill form - only if on publish page
    if (page.url().includes("publish") && !page.url().includes("category")) {
      await fillForm(page, title, price, p.description || "");
      await logStep(page, 'form-done', 'ok', { title, price });
      console.log(`[Taobao] Form filled: ${title}`);
    } else {
      console.log(`[Taobao] Skipping fill, not on publish page: ${page.url()}`);
      await page.screenshot({ path: join(SCREENSHOT_DIR, "skip_fill.png"), fullPage: false });
    }

    if (i < products.length - 1) {
      console.log('[Taobao] Waiting 5s before next product...');
      await page.waitForTimeout(5000);
    }
  }

  console.log('\n[Taobao] All products processed');
  return { success: true, message: 'Products listed' };
}

// ========================================================

async function searchAndSelectCategory(page, cat) {
  console.log(`[Taobao] V9 Searching category: "${cat}"`);
  await page.screenshot({ path: join(SCREENSHOT_DIR, `cat_entry_${Date.now()}.png`), fullPage: false });

  // Step 1: Click "搜索发品" tab to reveal the search input
  console.log('[Taobao] V9 Clicking search tab...');
  const tab = page.getByText('搜索发品');
  if (await tab.count() > 0) {
    await tab.first().click();
    await page.waitForTimeout(500);
  } else {
    console.log('[Taobao] V9 Search tab not found, continuing...');
  }

  // Step 2: Type category keyword into the search input
  const searchInput = page.locator('input[placeholder*="类目关键词"]').first();
  if (await searchInput.count() === 0) {
    console.log('[Taobao] V9 Search input not found');
    await page.screenshot({ path: join(SCREENSHOT_DIR, "no_input.png"), fullPage: true });
    return false;
  }

  console.log('[Taobao] V9 Typing category keyword...');
  await searchInput.click();
  await page.waitForTimeout(200);
  await searchInput.fill(cat);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  console.log('[Taobao] V9 Pressed Enter to search');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(SCREENSHOT_DIR, `after_search_${Date.now()}.png`), fullPage: false });

  // Step 3: Click the correct category (prefer 代用/花草/组合型花茶)
  const allResults = page.locator('.sell-rich-text.path-text:not(.readonly)');
  try {
    await allResults.first().waitFor({ state: 'visible', timeout: 10000 });
    const count = await allResults.count();
    console.log(`[Taobao] V9 Found ${count} category results`);
    let target = null;
    for (let i = 0; i < count; i++) {
      const txt = await allResults.nth(i).textContent();
      console.log(`[Taobao] V9 [${i}]: "${txt}"`);
      if (txt.includes('代用/花草') || txt.includes('组合型花茶') || (txt.includes('茶>') && !txt.includes('外卖') && !txt.includes('奶茶'))) {
        target = allResults.nth(i); break;
      }
    }
    if (!target) target = allResults.first();
    console.log(`[Taobao] V9 Selected: "${await target.textContent()}"`);
    await target.click();
    await page.waitForTimeout(1500);
  } catch (e) {
    console.log('[Taobao] V9 No results:', e.message);
    return false;
  }

  // Step 4: Click confirm/next button (multiple possible texts)
  const confirmTexts = ['确定使用该类型', '确定', '下一步', '确认', '立即发布', '开始发布', '发布宝贝'];
  let confirmed = false;
  for (const txt of confirmTexts) {
    try {
      const btn = page.getByText(txt, { exact: false }).first();
      if (await btn.count() > 0 && await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log(`[Taobao] V9 Clicking confirm: "${txt}"`);
        await btn.click();
        await page.waitForTimeout(2000);
        confirmed = true;
        break;
      }
    } catch {}
  }
  if (!confirmed) {
    console.log('[Taobao] V9 No confirm button found, checking if already on publish page');
  }

  // Step 5: Wait for redirect to publish page
  try {
    await page.waitForURL(/publish/, { timeout: 15000 });
    console.log('[Taobao] V9 Redirected to publish page');
  } catch (e) {
    console.log('[Taobao] V9 Redirect timeout:', e.message);
  }

  await page.screenshot({ path: join(SCREENSHOT_DIR, "after_category.png"), fullPage: false });
  const finalUrl = page.url();
  const onPublish = finalUrl.includes('publish') && !finalUrl.includes('category');
  console.log(`[Taobao] V9 Final URL: ${finalUrl}, onPublish: ${onPublish}`);
  return onPublish;
}
async function fillForm(page, title, price, desc) {
  console.log(`[Taobao] Filling form: "${title}" ${price}`);

  // Scroll to trigger lazy React rendering
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  // Wait for form fields to attach to DOM
  await page.waitForSelector('textarea, input', { state: 'attached', timeout: 30000 });
  console.log('[Taobao] Form elements found');

  // Expand ALL collapsed sections
  const expandTexts = ['展开收起项', '展开', '收起', '只看必填', '销售信息', '基础信息', '物流服务', '售后服务'];
  for (const txt of expandTexts) {
    try {
      const btn = page.locator(`text=${txt}`).first();
      if (await btn.count() > 0 && await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(500);
        console.log(`[Taobao] Clicked expand: "${txt}"`);
      }
    } catch {}
  }
  // Also click any span/div with "展开" text
  try {
    const expandEls = await page.locator('span:has-text("展开"), div:has-text("展开")').all();
    for (const el of expandEls) {
      await el.click().catch(() => {});
      await page.waitForTimeout(300);
    }
  } catch {}
  await page.waitForTimeout(1000);

  // Fill using Playwright locators
  const filled = { title: false, price: false, qty: false };

  try {
    const allInputs = page.locator('input:visible, textarea:visible');
    const c = await allInputs.count();
    console.log(`[Taobao] Visible inputs: ${c}`);
    for (let i = 0; i < c; i++) {
      const el = allInputs.nth(i);
      const ph = (await el.getAttribute('placeholder').catch(() => '')) || '';
      const nm = (await el.getAttribute('name').catch(() => '')) || '';
      const parentText = await el.locator('..').innerText().catch(() => '');

      // Title: unique placeholder "最多允许输入30个汉字（60字符）"
      if (!filled.title && ph.includes('30个汉字')) {
        await el.click(); await el.fill(title);
        console.log(`[Taobao] ✓ Title: "${title}"`);
        filled.title = true;
      }
      // Price: parent text contains "一口价"
      else if (!filled.price && (parentText.includes('一口价') || ph.includes('一口价') || nm === 'price')) {
        await el.click(); await el.fill(String(price));
        console.log(`[Taobao] ✓ Price: ${price}`);
        filled.price = true;
      }
      // Stock: parent text contains "总库存"
      else if (!filled.qty && (parentText.includes('总库存') || parentText.includes('库存') || nm === 'quantity')) {
        await el.click(); await el.fill('9999');
        console.log(`[Taobao] ✓ Stock: 9999`);
        filled.qty = true;
      }
    }

    // Fallback: scan again after expand for price/stock
    if (!filled.price || !filled.qty) {
      const allAfter = page.locator('input:visible');
      const c2 = await allAfter.count();
      for (let i = 0; i < c2; i++) {
        const el = allAfter.nth(i);
        const ph = (await el.getAttribute('placeholder').catch(() => '')) || '';
        const parentText = await el.locator('..').innerText().catch(() => '');
        if (!filled.price && (parentText.includes('一口价') || parentText.includes('价格') || ph.includes('元'))) {
          await el.click(); await el.fill(String(price));
          console.log(`[Taobao] ✓ Price (rescan): ${price}`);
          filled.price = true;
        }
        if (!filled.qty && (parentText.includes('总库存') || parentText.includes('库存'))) {
          await el.click(); await el.fill('9999');
          console.log(`[Taobao] ✓ Stock (rescan): 9999`);
          filled.qty = true;
        }
      }
    }
  } catch (e) {
    console.log('[Taobao] Fill error:', e.message);
  }

  console.log(`[Taobao] Fill result: title=${filled.title} price=${filled.price} qty=${filled.qty}`);
  await page.screenshot({ path: join(SCREENSHOT_DIR, "after_fill.png"), fullPage: false });
}
