import { chromium } from 'playwright';
import { join } from 'path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';

const USER_DATA_DIR = process.env.TAOBAO_PROFILE_DIR || join(process.cwd(), 'data', 'taobao-profile');
const SCREENSHOT_DIR = join(process.cwd(), 'data', 'screenshots');
const LOG_DIR = join(process.cwd(), 'data', 'logs');

// Helper: wrap a promise with a timeout
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`操作超时 (${ms / 1000}s)`)), ms)),
  ]);
}

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

/**
 * Determine category keyword from product info
 */
function resolveCategory(product) {
  // Priority: explicit category > tags > extract from title
  if (product.category && product.category.trim()) return product.category.trim();
  if (product.tags && product.tags.trim()) return product.tags.trim();

  // Extract from title: look for common category keywords
  const title = product.title || '';
  const categoryMap = [
    { keywords: ['花茶', '菊花', '玫瑰', '茉莉', '桂花', '洛神', '花草'], category: '花茶' },
    { keywords: ['枸杞', '黄芪', '三七', '灵芝', '石斛', '人参', '当归', '党参'], category: '滋补品' },
    { keywords: ['红枣', '银耳', '燕窝', '阿胶', '鹿茸'], category: '滋补品' },
    { keywords: ['茶叶', '红茶', '绿茶', '铁观音', '普洱', '龙井'], category: '茶叶' },
    { keywords: ['柠檬', '陈皮', '薄荷', '决明子', '胖大海'], category: '代用茶' },
    { keywords: ['手机壳', '数据线', '充电器', '耳机'], category: '手机配件' },
    { keywords: ['收纳', '整理箱', '置物架'], category: '收纳用品' },
  ];
  for (const { keywords, category } of categoryMap) {
    if (keywords.some(kw => title.includes(kw))) return category;
  }
  return title.split(/\s+/)[0] || '其他'; // fallback: first word of title
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

  // Check if we actually landed on seller page, not just any taobao page
  const urlAfterLogin = page.url();
  const isOnSellerPage = urlAfterLogin.includes('myseller.taobao.com');
  const isOnUploadPage = urlAfterLogin.includes('item.upload.taobao.com');

  if (!isOnSellerPage && !isOnUploadPage) {
    // Either on login page or redirected elsewhere (e.g. taobao.com without login)
    console.log('[Taobao] Not on seller page, current URL:', urlAfterLogin);

    if (urlAfterLogin.includes('login') || urlAfterLogin.includes('passport')) {
      console.log('[Taobao] Login page detected — please scan QR code...');
    } else {
      console.log('[Taobao] Redirected to unexpected page — login required, navigating to login...');
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
      console.log('[Taobao] Login completed, current page:', page.url());
    } catch (e) { console.log('[Taobao] Login timeout:', e.message); }
  } else {
    console.log('[Taobao] Already logged in, on seller page');
  }

  // Process products
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
        // Wrap fillForm with timeout to prevent hanging
        let fillResult = { title: false, price: false, qty: false, desc: false, brand: false, images: false };
        try {
          fillResult = await withTimeout(fillForm(page, title, price, p.description || '', p), 60000);
        } catch (e) {
          console.log('[Taobao] fillForm timeout/error:', e.message);
          await logStep(page, 'form-error', 'timeout', { error: e.message });
        }
        await logStep(page, 'form-done', fillResult.title && fillResult.price ? 'ok' : 'partial', fillResult);
        console.log(`[Taobao] Form filled: title=${fillResult.title} price=${fillResult.price} qty=${fillResult.qty}`);

        // Submit and verify — also with timeout
        let submitResult = { success: false, message: '未执行提交' };
        try {
          submitResult = await withTimeout(submitAndVerify(page), 45000);
        } catch (e) {
          console.log('[Taobao] submitAndVerify timeout/error:', e.message);
          await logStep(page, 'submit-error', 'timeout', { error: e.message });
          submitResult = { success: false, message: `提交超时: ${e.message}` };
        }
        await logStep(page, 'submit-done', submitResult.success ? 'success' : 'failed', submitResult);

        productResult.success = submitResult.success;
        productResult.message = submitResult.message;
        productResult.taobaoItemId = submitResult.itemId || null;

        if (submitResult.success) {
          console.log(`[Taobao] ✓ Published: ${title} → ${submitResult.itemId || 'success'}`);
        } else {
          console.log(`[Taobao] ✗ Publish failed: ${title} — ${submitResult.message}`);
        }
      } else {
        console.log(`[Taobao] Skipping fill, not on publish page: ${page.url()}`);
        await page.screenshot({ path: join(SCREENSHOT_DIR, "skip_fill.png"), fullPage: false });
        productResult.message = '未到达发布页面';
      }
    } catch (err) {
      console.log(`[Taobao] Product ${p.id} error:`, err.message);
      productResult.message = err.message;
      await logStep(page, 'error', 'exception', { error: err.message });
    }

    results.push(productResult);

    if (i < products.length - 1) {
      console.log('[Taobao] Waiting 5s before next product...');
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

// ========================================================

async function searchAndSelectCategory(page, cat) {
  console.log(`[Taobao] Searching category: "${cat}"`);
  await page.screenshot({ path: join(SCREENSHOT_DIR, `cat_entry_${Date.now()}.png`), fullPage: false });

  // Step 1: Click "搜索发品" tab to reveal the search input
  console.log('[Taobao] Clicking search tab...');
  const tab = page.getByText('搜索发品');
  if (await tab.count() > 0) {
    await tab.first().click();
    await page.waitForTimeout(500);
  } else {
    console.log('[Taobao] Search tab not found, continuing...');
  }

  // Step 2: Type category keyword into the search input
  const searchInput = page.locator('input[placeholder*="类目关键词"]').first();
  if (await searchInput.count() === 0) {
    console.log('[Taobao] Search input not found');
    await page.screenshot({ path: join(SCREENSHOT_DIR, "no_input.png"), fullPage: true });
    return false;
  }

  console.log('[Taobao] Typing category keyword...');
  await searchInput.click();
  await page.waitForTimeout(200);
  await searchInput.fill(cat);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  console.log('[Taobao] Pressed Enter to search');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(SCREENSHOT_DIR, `after_search_${Date.now()}.png`), fullPage: false });

  // Step 3: Click the correct category result
  const allResults = page.locator('.sell-rich-text.path-text:not(.readonly)');
  try {
    await allResults.first().waitFor({ state: 'visible', timeout: 10000 });
    const count = await allResults.count();
    console.log(`[Taobao] Found ${count} category results`);
    let target = null;

    // Smart matching: look for category that contains our keyword
    const catLower = cat.toLowerCase();
    for (let i = 0; i < count; i++) {
      const txt = await allResults.nth(i).textContent();
      console.log(`[Taobao] [${i}]: "${txt}"`);
      // Prefer exact or close match
      if (txt.includes(cat) || catLower.split('').some(c => txt.includes(c))) {
        target = allResults.nth(i);
        break;
      }
    }
    // Fallback: first result
    if (!target) target = allResults.first();
    const selectedText = await target.textContent();
    console.log(`[Taobao] Selected: "${selectedText}"`);
    await target.click();
    await page.waitForTimeout(1500);
  } catch (e) {
    console.log('[Taobao] No results:', e.message);
    return false;
  }

  // Step 4: Click confirm/next button
  const confirmTexts = ['确定使用该类型', '确定', '下一步', '确认', '立即发布', '开始发布', '发布宝贝'];
  let confirmed = false;
  for (const txt of confirmTexts) {
    try {
      const btn = page.getByText(txt, { exact: false }).first();
      if (await btn.count() > 0 && await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log(`[Taobao] Clicking confirm: "${txt}"`);
        await btn.click();
        await page.waitForTimeout(2000);
        confirmed = true;
        break;
      }
    } catch {}
  }
  if (!confirmed) {
    console.log('[Taobao] No confirm button found, checking if already on publish page');
  }

  // Step 5: Wait for redirect to publish page
  try {
    await page.waitForURL(/publish/, { timeout: 15000 });
    console.log('[Taobao] Redirected to publish page');
  } catch (e) {
    console.log('[Taobao] Redirect timeout:', e.message);
  }

  await page.screenshot({ path: join(SCREENSHOT_DIR, "after_category.png"), fullPage: false });
  const finalUrl = page.url();
  const onPublish = finalUrl.includes('publish') && !finalUrl.includes('category');
  console.log(`[Taobao] Final URL: ${finalUrl}, onPublish: ${onPublish}`);
  return onPublish;
}

// ========================================================
// fillForm: fill all required fields on the publish page
// ========================================================
async function fillForm(page, title, price, desc, product) {
  console.log(`[Taobao] Filling form: "${title}" ${price}`);
  const filled = { title: false, price: false, qty: false, desc: false, brand: false, images: false };

  // Scroll to trigger lazy React rendering
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  // Wait for form fields — try multiple selectors, don't block forever
  console.log('[Taobao] Waiting for form fields...');
  try {
    await Promise.race([
      page.waitForSelector('textarea', { state: 'attached', timeout: 15000 }),
      page.waitForSelector('input[type="text"]', { state: 'attached', timeout: 15000 }),
      page.waitForSelector('[contenteditable="true"]', { state: 'attached', timeout: 15000 }),
      page.waitForSelector('.ql-editor', { state: 'attached', timeout: 15000 }),
      page.waitForSelector('[class*="formItem"]', { state: 'attached', timeout: 15000 }),
      page.waitForSelector('[class*="Form"]', { state: 'attached', timeout: 15000 }),
    ]);
    console.log('[Taobao] Form elements found');
  } catch (e) {
    console.log('[Taobao] Form elements wait timeout, trying to proceed anyway');
    await page.screenshot({ path: join(SCREENSHOT_DIR, "form_wait_timeout.png"), fullPage: true });
  }

  // Expand ALL collapsed sections
  const expandTexts = ['展开收起项', '展开', '只看必填', '销售信息', '基础信息', '物流服务', '售后服务', '商品描述'];
  for (const txt of expandTexts) {
    try {
      const btn = page.locator(`text=${txt}`).first();
      if (await btn.count() > 0 && await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(400);
        console.log(`[Taobao] Clicked expand: "${txt}"`);
      }
    } catch {}
  }
  await page.waitForTimeout(1000);

  // ---- Step 1: Fill title, price, stock via Playwright locators ----
  try {
    const allInputs = page.locator('input:visible, textarea:visible');
    const c = await allInputs.count();
    console.log(`[Taobao] Visible inputs: ${c}`);
    for (let i = 0; i < c; i++) {
      const el = allInputs.nth(i);
      const ph = (await el.getAttribute('placeholder').catch(() => '')) || '';
      const nm = (await el.getAttribute('name').catch(() => '')) || '';
      // Search ancestor chain for label text (not just direct parent)
      let ancestorText = '';
      try {
        for (let level = 1; level <= 5; level++) {
          const parentEl = el.locator('../'.repeat(level));
          const text = await parentEl.innerText().catch(() => '');
          if (text && text.length > ancestorText.length) ancestorText = text;
        }
      } catch {}

      // Title
      if (!filled.title && (ph.includes('30个汉字') || ph.includes('宝贝标题') || ph.includes('商品标题'))) {
        await el.click(); await el.fill(title);
        console.log(`[Taobao] ✓ Title: "${title}"`);
        filled.title = true;
      }
      // Price — search ancestor chain for label indicators
      else if (!filled.price && (ancestorText.includes('一口价') || ph.includes('一口价') || nm === 'price' || ph.includes('价格'))) {
        await el.click(); await el.fill(String(price));
        console.log(`[Taobao] ✓ Price: ${price}`);
        filled.price = true;
      }
      // Stock — search ancestor chain
      else if (!filled.qty && (ancestorText.includes('总库存') || ph.includes('总库存') || nm === 'quantity' || ph.includes('库存'))) {
        await el.click(); await el.fill('9999');
        console.log(`[Taobao] ✓ Stock: 9999`);
        filled.qty = true;
      }
    }
  } catch (e) {
    console.log('[Taobao] Basic fill error:', e.message);
  }

  // ---- Step 2: Find by label text → then use Playwright fill() ----
  if (!filled.price || !filled.qty) {
    console.log('[Taobao] Step 1 missed price/stock, searching by label text...');
    const labelPairs = [
      { label: '一口价', key: 'price', value: String(price) },
      { label: '总库存', key: 'qty', value: '9999' },
    ];
    for (const { label, key, value } of labelPairs) {
      if ((key === 'price' && filled.price) || (key === 'qty' && filled.qty)) continue;
      try {
        // Use XPath to find input near label text
        const xpath = `//*[contains(text(), '${label}')]/ancestor::*[contains(@class, 'Form') or contains(@class, 'form') or contains(@class, 'item') or contains(@class, 'row') or contains(@class, 'section') or contains(@class, 'field') or contains(@class, 'group')]//input[not(@type='hidden')]|//*[contains(text(), '${label}')]/ancestor::div[1]//input[not(@type='hidden')]|//*[contains(text(), '${label}')]/ancestor::tr[1]//input[not(@type='hidden')]`;
        const candidates = page.locator(`xpath=${xpath}`);
        const candCount = await candidates.count();
        console.log(`[Taobao] Found ${candCount} input candidates near "${label}"`);
        for (let k = 0; k < Math.min(candCount, 10); k++) {
          const inp = candidates.nth(k);
          const box = await inp.boundingBox().catch(() => null);
          if (box && box.width > 30 && box.height > 8) {
            await inp.click();
            await inp.fill(value);
            if (key === 'price') filled.price = true;
            if (key === 'qty') filled.qty = true;
            console.log(`[Taobao] ✓ ${label}: ${value} (XPath + fill)`);
            break;
          }
        }
      } catch (e) {
        console.log(`[Taobao] XPath search for "${label}" error:`, e.message);
      }

      // Fallback: try Playwright text locator with ancestor chaining
      if ((key === 'price' && !filled.price) || (key === 'qty' && !filled.qty)) {
        try {
          const textLocators = page.locator(`:text-is("${label}")`);
          const tlCount = await textLocators.count();
          for (let j = 0; j < Math.min(tlCount, 10); j++) {
            const lbl = textLocators.nth(j);
            const txt = await lbl.textContent().catch(() => '');
            if (!txt || txt.trim() !== label) continue;
            // Chain parent() calls instead of string repeat
            for (let level = 1; level <= 6; level++) {
              let container = lbl;
              for (let up = 0; up < level; up++) container = container.locator('..');
              const inputs = container.locator('input:visible:not([type="hidden"])');
              const ic = await inputs.count();
              for (let k = 0; k < ic; k++) {
                const inp = inputs.nth(k);
                const box = await inp.boundingBox().catch(() => null);
                if (box && box.width > 30 && box.height > 8) {
                  await inp.click();
                  await inp.fill(value);
                  if (key === 'price') filled.price = true;
                  if (key === 'qty') filled.qty = true;
                  console.log(`[Taobao] ✓ ${label}: ${value} (text locator + fill)`);
                  break;
                }
              }
              if ((key === 'price' && filled.price) || (key === 'qty' && filled.qty)) break;
            }
            if ((key === 'price' && filled.price) || (key === 'qty' && filled.qty)) break;
          }
        } catch (e2) {
          console.log(`[Taobao] Text locator search for "${label}" error:`, e2.message);
        }
      }
    }
  }

  // ---- Step 3: Handle dropdown fields (brand, packaging, origin, etc.) ----
  try {
    const dropdownResult = await handleDropdownFields(page);
    filled.brand = dropdownResult.brand;
    console.log(`[Taobao] Dropdown fields: brand=${dropdownResult.brand} pkg=${dropdownResult.packaging} origin=${dropdownResult.origin}`);
  } catch (e) {
    console.log('[Taobao] Dropdown fill error:', e.message);
  }

  // ---- Step 4: Upload images if available ----
  try {
    const images = parseImages(product?.images);
    if (images.length > 0) {
      filled.images = await uploadImages(page, images);
      console.log(`[Taobao] Images uploaded: ${filled.images}`);
    } else {
      console.log('[Taobao] No images to upload');
    }
  } catch (e) {
    console.log('[Taobao] Image upload error:', e.message);
  }

  // ---- Step 5: Fill description ----
  if (desc) {
    try {
      const descResult = await page.evaluate(({ desc }) => {
        const all = document.querySelectorAll('*');
        for (const el of all) {
          if (el.textContent && el.textContent.trim() === '宝贝详情' && el.textContent.length === 6) {
            let container = el.parentElement;
            for (let d = 0; d < 8 && container; d++) {
              const textareas = container.querySelectorAll('textarea, [contenteditable="true"], .ql-editor');
              for (const ta of textareas) {
                const r = ta.getBoundingClientRect();
                if (r.width > 50 && r.height > 20) {
                  ta.focus();
                  if (ta.contentEditable === 'true') {
                    ta.innerHTML = desc;
                  } else {
                    ta.value = desc;
                  }
                  ta.dispatchEvent(new Event('input', { bubbles: true }));
                  ta.dispatchEvent(new Event('change', { bubbles: true }));
                  return true;
                }
              }
              container = container.parentElement;
            }
          }
        }
        return false;
      }, { desc });
      filled.desc = descResult;
      if (descResult) console.log('[Taobao] ✓ Description filled');
    } catch (e) {
      console.log('[Taobao] Description fill error:', e.message);
    }
  }

  console.log(`[Taobao] Fill result: title=${filled.title} price=${filled.price} qty=${filled.qty} brand=${filled.brand} images=${filled.images}`);
  await page.screenshot({ path: join(SCREENSHOT_DIR, "after_fill.png"), fullPage: false });
  return filled;
}

// ========================================================
// Handle dropdown fields: brand, packaging, origin
// ========================================================
async function handleDropdownFields(page) {
  const result = { brand: false, packaging: false, origin: false };

  // Strategy: find label → find nearby select/dropdown → click → pick first option
  const fields = [
    { label: '品牌', key: 'brand', fallbackValue: '其他' },
    { label: '包装方式', key: 'packaging', fallbackValue: null },
    { label: '产地', key: 'origin', fallbackValue: null },
    { label: '材质', key: 'material', fallbackValue: null },
  ];

  for (const field of fields) {
    try {
      const clicked = await page.evaluate(({ label }) => {
        const all = document.querySelectorAll('*');
        for (const el of all) {
          // Match label text (exact or starts with)
          const txt = (el.textContent || '').trim();
          if (txt === label || txt === label + '：' || txt === label + ':') {
            let container = el.parentElement;
            for (let d = 0; d < 6 && container; d++) {
              // Look for select-like elements
              const selectors = container.querySelectorAll(
                '[class*="select"], [class*="Select"], [placeholder*="请选择"], [placeholder*="输入"], .next-select, select'
              );
              for (const sel of selectors) {
                const r = sel.getBoundingClientRect();
                if (r.width > 40 && r.height > 8) {
                  sel.click();
                  return true;
                }
              }
              container = container.parentElement;
            }
          }
        }
        return false;
      }, { label: field.label });

      if (clicked) {
        await page.waitForTimeout(800);
        // Try to select first visible dropdown option
        const optionSelected = await selectFirstDropdownOption(page);
        if (optionSelected) {
          result[field.key] = true;
          console.log(`[Taobao] ✓ ${field.label}: selected`);
        } else if (field.fallbackValue) {
          // Try typing fallback value into the input
          await page.keyboard.type(field.fallbackValue);
          await page.waitForTimeout(500);
          await page.keyboard.press('Enter');
          result[field.key] = true;
          console.log(`[Taobao] ✓ ${field.label}: typed "${field.fallbackValue}"`);
        }
      }
    } catch (e) {
      console.log(`[Taobao] ${field.label} error:`, e.message);
    }
  }

  return result;
}

/**
 * Select the first visible option from an open dropdown
 */
async function selectFirstDropdownOption(page) {
  try {
    // Common dropdown option selectors
    const optionSelectors = [
      '.next-menu-item',
      '.ant-select-item-option',
      '[class*="option"]',
      '[class*="menu-item"]',
      '[role="option"]',
      'li[class*="select"]',
    ];

    for (const sel of optionSelectors) {
      const options = page.locator(`${sel}:visible`);
      const count = await options.count();
      if (count > 0) {
        // Skip placeholder-like options
        for (let i = 0; i < Math.min(count, 5); i++) {
          const txt = await options.nth(i).textContent().catch(() => '');
          if (txt && !txt.includes('请选择') && !txt.includes('全部') && txt.trim().length > 0) {
            await options.nth(i).click();
            await page.waitForTimeout(300);
            return true;
          }
        }
        // Fallback: click first option
        await options.first().click();
        await page.waitForTimeout(300);
        return true;
      }
    }

    // Last resort: press Enter or Escape to close
    await page.keyboard.press('Escape');
    return false;
  } catch {
    return false;
  }
}

// ========================================================
// Parse images from product data
// ========================================================
function parseImages(imagesField) {
  if (!imagesField) return [];
  try {
    const parsed = typeof imagesField === 'string' ? JSON.parse(imagesField) : imagesField;
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {}
  return [];
}

// ========================================================
// Upload images to the publish form
// ========================================================
async function uploadImages(page, imageUrls) {
  // Download images first
  const tempDir = join(process.cwd(), 'data', 'temp-images');
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });

  const downloadedPaths = [];
  for (let i = 0; i < Math.min(imageUrls.length, 5); i++) {
    const url = imageUrls[i];
    if (!url) continue;
    try {
      const ext = url.match(/\.(jpg|jpeg|png|gif|webp)/i)?.[1] || 'jpg';
      const filePath = join(tempDir, `img_${i}.${ext}`);
      const response = await page.context().request.get(url);
      const buffer = await response.body();
      writeFileSync(filePath, buffer);
      downloadedPaths.push(filePath);
      console.log(`[Taobao] Downloaded image ${i}: ${filePath}`);
    } catch (e) {
      console.log(`[Taobao] Failed to download image ${i}:`, e.message);
    }
  }

  if (downloadedPaths.length === 0) return false;

  // Read first image file for strategies that need it
  const fs = await import('fs');
  const fileBuffer = fs.readFileSync(downloadedPaths[0]);
  const fileName = downloadedPaths[0].split(/[/\\]/).pop();

  try {
    // Strategy 7: Click empty image box to trigger fileChooser (HIGHEST PRIORITY)
    console.log('[Taobao] Trying click-to-upload strategy...');
    try {
      // Find the 1:1主图 area and click empty image boxes
      const clickResult = await page.evaluate(() => {
        // Find all elements with text "1:1主图"
        const allElements = document.querySelectorAll('*');
        let mainImageArea = null;
        
        for (const el of allElements) {
          const text = el.textContent?.trim() || '';
          if (text === '1:1主图' || text === '1:1主图裁剪' || text === '从1:1主图裁剪') {
            // Found the text - look for parent container
            let parent = el.parentElement;
            for (let depth = 0; depth < 10 && parent; depth++) {
              const className = parent.className || '';
              if (className.includes('sku') || className.includes('SKU') || className.includes('excel')) break;
              
              const rect = parent.getBoundingClientRect();
              if (rect.width > 200 && rect.height > 200) {
                mainImageArea = parent;
                break;
              }
              parent = parent.parentElement;
            }
            if (mainImageArea) break;
          }
        }
        
        if (!mainImageArea) return { success: false, error: 'No 1:1主图 area found' };
        
        // Find clickable elements within the area (empty image boxes, upload buttons)
        const clickables = mainImageArea.querySelectorAll('div, span, button, a, img');
        const clicked = [];
        
        for (const el of clickables) {
          const rect = el.getBoundingClientRect();
          // Look for small square elements (likely empty image boxes)
          if (rect.width > 30 && rect.width < 200 && rect.height > 30 && rect.height < 200) {
            const className = el.className || '';
            const style = window.getComputedStyle(el);
            
            // Check if it looks like an empty image box
            const isEmpty = !el.querySelector('img[src]') || 
                           className.includes('empty') || 
                           className.includes('placeholder') ||
                           style.cursor === 'pointer';
            
            if (isEmpty) {
              el.click();
              clicked.push({ className, rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } });
              break; // Click first empty box
            }
          }
        }
        
        return { success: clicked.length > 0, clicked, areaClass: mainImageArea.className };
      });
      
      console.log('[Taobao] Click result:', JSON.stringify(clickResult));
      
      if (clickResult.success) {
        // Wait for fileChooser event
        try {
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 5000 }),
            page.waitForTimeout(1000), // Small delay for the click to trigger
          ]);
          await fileChooser.setFiles(downloadedPaths);
          await page.waitForTimeout(3000);
          console.log(`[Taobao] ✓ Uploaded ${downloadedPaths.length} images via click-to-upload`);
          return true;
        } catch (fcErr) {
          console.log('[Taobao] fileChooser not triggered by click:', fcErr.message);
        }
      }
    } catch (e) {
      console.log('[Taobao] Click-to-upload failed:', e.message);
    }

    // Strategy 1: Try fileChooser event with various upload triggers
    console.log('[Taobao] Trying fileChooser strategy...');
    const uploadTriggers = [
      '从1:1主图裁剪',
      '从3:4主图裁剪',
      '上传图片',
      '添加图片',
      '上传主图',
    ];

    for (const triggerText of uploadTriggers) {
      try {
        const trigger = page.locator(`text="${triggerText}"`).first();
        if (await trigger.count() > 0 && await trigger.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log(`[Taobao] Found upload trigger: "${triggerText}"`);
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 5000 }),
            trigger.click(),
          ]);
          await fileChooser.setFiles(downloadedPaths);
          await page.waitForTimeout(3000);
          console.log(`[Taobao] ✓ Uploaded ${downloadedPaths.length} images via fileChooser (${triggerText})`);
          return true;
        }
      } catch (e) {
        console.log(`[Taobao] fileChooser with "${triggerText}" failed:`, e.message);
      }
    }

    // Strategy 2: Find any clickable upload area and try fileChooser
    console.log('[Taobao] Trying generic upload area click...');
    const uploadAreas = page.locator('[class*="upload"], [class*="Upload"], [class*="image-picker"], [class*="ImagePicker"]');
    const areaCount = await uploadAreas.count();
    for (let i = 0; i < Math.min(areaCount, 3); i++) {
      try {
        const area = uploadAreas.nth(i);
        if (await area.isVisible({ timeout: 1000 }).catch(() => false)) {
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 3000 }),
            area.click(),
          ]);
          await fileChooser.setFiles(downloadedPaths);
          await page.waitForTimeout(3000);
          console.log(`[Taobao] ✓ Uploaded ${downloadedPaths.length} images via upload area`);
          return true;
        }
      } catch {}
    }

    // Strategy 3: Try native file input (may exist after clicking upload area)
    console.log('[Taobao] Looking for native file input...');
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(downloadedPaths);
      await page.waitForTimeout(3000);
      console.log(`[Taobao] ✓ Uploaded ${downloadedPaths.length} images via file input`);
      return true;
    }

    // Strategy 4: Force reveal hidden file inputs
    const allFileInputs = page.locator('input[type="file"]');
    const fiCount = await allFileInputs.count();
    if (fiCount > 0) {
      await page.evaluate(() => {
        document.querySelectorAll('input[type="file"]').forEach(el => {
          el.style.display = 'block';
          el.style.visibility = 'visible';
          el.style.opacity = '1';
          el.style.position = 'static';
        });
      });
      await allFileInputs.first().setInputFiles(downloadedPaths);
      await page.waitForTimeout(3000);
      console.log(`[Taobao] ✓ Uploaded ${downloadedPaths.length} images via revealed file input`);
      return true;
    }

    // Strategy 5: Drag-and-drop upload — target 1:1主图 area specifically
    console.log('[Taobao] Trying drag-and-drop strategy...');
    try {
      // Wait for loading overlay to disappear
      console.log('[Taobao] Waiting for loading overlay to disappear...');
      await page.waitForSelector('.next-loading', { state: 'hidden', timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000); // Extra wait for React rendering
      
      // Use page.evaluate to find the correct 1:1主图 drop zone and simulate drag-and-drop
      const dropResult = await page.evaluate(({ fileBufferBase64, fileName }) => {
        // Convert base64 to Uint8Array
        const binaryString = atob(fileBufferBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Create File object
        const file = new File([bytes], fileName, { type: 'image/jpeg' });
        
        // Strategy: Find 1:1主图 upload area by finding "上传图片" button and looking up its parent
        function findMainImageDropZone() {
          const allElements = document.querySelectorAll('*');
          
          // Method 1: Find "上传图片" buttons and look up parent containers
          for (const el of allElements) {
            const text = el.textContent?.trim() || '';
            if (text === '上传图片' || text === '上传主图' || text === '添加图片') {
              const rect = el.getBoundingClientRect();
              if (rect.width < 20 || rect.height < 10) continue; // Skip tiny elements
              
              // Look up parent chain for upload container
              let parent = el.parentElement;
              for (let depth = 0; depth < 8 && parent; depth++) {
                const className = parent.className || '';
                // Skip SKU areas
                if (className.includes('sku') || className.includes('SKU') || className.includes('excel')) {
                  break; // This button is in SKU area, skip it
                }
                
                const parentRect = parent.getBoundingClientRect();
                const isLargeEnough = parentRect.width > 80 && parentRect.height > 80;
                
                // Check if parent looks like an upload container
                const hasUploadClass = className.includes('upload') || className.includes('Upload') ||
                                      className.includes('drop') || className.includes('Drop') ||
                                      className.includes('image') || className.includes('Image') ||
                                      className.includes('picture') || className.includes('Picture') ||
                                      className.includes('avatar') || className.includes('Avatar');
                
                if (isLargeEnough && (hasUploadClass || depth >= 2)) {
                  // Check if this container is near "1:1主图" text
                  const containerText = parent.textContent || '';
                  if (containerText.includes('1:1') || containerText.includes('主图') || depth >= 3) {
                    return { element: parent, className: parent.className, rect: { x: parentRect.x, y: parentRect.y, w: parentRect.width, h: parentRect.height } };
                  }
                }
                
                parent = parent.parentElement;
              }
            }
          }
          
          // Method 2: Find "1:1主图" text and look for nearby clickable areas
          for (const el of allElements) {
            const text = el.textContent?.trim() || '';
            if (text === '1:1主图' || text === '1:1主图裁剪' || text === '从1:1主图裁剪') {
              // Look for nearby sibling or parent that's clickable
              let parent = el.parentElement;
              for (let depth = 0; depth < 10 && parent; depth++) {
                const className = parent.className || '';
                if (className.includes('sku') || className.includes('SKU') || className.includes('excel')) break;
                
                // Check all children for clickable areas
                const children = parent.querySelectorAll('div, span, button, a');
                for (const child of children) {
                  const childRect = child.getBoundingClientRect();
                  if (childRect.width > 80 && childRect.height > 80) {
                    const childClass = child.className || '';
                    if (!childClass.includes('sku') && !childClass.includes('SKU') && !childClass.includes('excel')) {
                      return { element: child, className: child.className, rect: { x: childRect.x, y: childRect.y, w: childRect.width, h: childRect.height } };
                    }
                  }
                }
                
                parent = parent.parentElement;
              }
            }
          }
          
          // Method 3: Find any large upload area (but exclude SKU areas)
          const uploadAreas = document.querySelectorAll('[class*="upload"], [class*="Upload"], [class*="drop"], [class*="Drop"]');
          for (const area of uploadAreas) {
            const className = area.className || '';
            // Skip SKU areas
            if (className.includes('sku') || className.includes('SKU') || className.includes('excel')) continue;
            
            const rect = area.getBoundingClientRect();
            if (rect.width > 100 && rect.height > 100) {
              return { element: area, className: area.className, rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } };
            }
          }
          
          return null;
        }
        
        let dropZoneInfo = findMainImageDropZone();
        if (!dropZoneInfo) return { success: false, error: 'No 1:1主图 drop zone found' };
        
        //绕过 loading overlay: if found element has loading class, look for parent/sibling/child
        if (dropZoneInfo.className && dropZoneInfo.className.includes('loading')) {
          console.log('[Taobao] Found loading overlay, trying to bypass...');
          
          // Try 1: Use parent element
          const parent = dropZoneInfo.element.parentElement;
          if (parent) {
            const parentRect = parent.getBoundingClientRect();
            if (parentRect.width > 80 && parentRect.height > 80) {
              dropZoneInfo = { element: parent, className: parent.className, rect: { x: parentRect.x, y: parentRect.y, w: parentRect.width, h: parentRect.height } };
              console.log('[Taobao] Using parent element as drop zone');
            }
          }
          
          // Try 2: Use sibling elements
          if (dropZoneInfo.className && dropZoneInfo.className.includes('loading')) {
            const siblings = parent?.children || [];
            for (const sibling of siblings) {
              if (sibling !== dropZoneInfo.element) {
                const sibRect = sibling.getBoundingClientRect();
                if (sibRect.width > 80 && sibRect.height > 80) {
                  dropZoneInfo = { element: sibling, className: sibling.className, rect: { x: sibRect.x, y: sibRect.y, w: sibRect.width, h: sibRect.height } };
                  console.log('[Taobao] Using sibling element as drop zone');
                  break;
                }
              }
            }
          }
          
          // Try 3: Use child elements (skip loading wrapper)
          if (dropZoneInfo.className && dropZoneInfo.className.includes('loading')) {
            const children = dropZoneInfo.element.querySelectorAll('*');
            for (const child of children) {
              const childClass = child.className || '';
              if (!childClass.includes('loading')) {
                const childRect = child.getBoundingClientRect();
                if (childRect.width > 50 && childRect.height > 50) {
                  dropZoneInfo = { element: child, className: child.className, rect: { x: childRect.x, y: childRect.y, w: childRect.width, h: childRect.height } };
                  console.log('[Taobao] Using child element as drop zone');
                  break;
                }
              }
            }
          }
        }
        
        // Create DataTransfer
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        
        // Dispatch drag events on the correct drop zone
        const dragEnter = new DragEvent('dragenter', { bubbles: true, dataTransfer });
        const dragOver = new DragEvent('dragover', { bubbles: true, dataTransfer });
        const drop = new DragEvent('drop', { bubbles: true, dataTransfer });
        
        dropZoneInfo.element.dispatchEvent(dragEnter);
        dropZoneInfo.element.dispatchEvent(dragOver);
        dropZoneInfo.element.dispatchEvent(drop);
        
        return { 
          success: true, 
          dropZoneClass: dropZoneInfo.className,
          dropZoneRect: dropZoneInfo.rect,
          target: '1:1主图'
        };
      }, { fileBufferBase64: fileBuffer.toString('base64'), fileName });
      
      console.log('[Taobao] Drag-and-drop result:', JSON.stringify(dropResult));
      await page.waitForTimeout(3000);
      
      // Check if images were actually uploaded (not just existing images)
      // Look for new thumbnails in the 1:1主图 area
      const uploadSuccess = await page.evaluate(() => {
        // Find the 1:1主图 area
        const allElements = document.querySelectorAll('*');
        let mainImageArea = null;
        
        for (const el of allElements) {
          const text = el.textContent?.trim() || '';
          if (text === '1:1主图' || text === '1:1主图裁剪' || text === '从1:1主图裁剪') {
            let parent = el.parentElement;
            for (let depth = 0; depth < 10 && parent; depth++) {
              const className = parent.className || '';
              if (className.includes('sku') || className.includes('SKU') || className.includes('excel')) break;
              
              const rect = parent.getBoundingClientRect();
              if (rect.width > 200 && rect.height > 200) {
                mainImageArea = parent;
                break;
              }
              parent = parent.parentElement;
            }
            if (mainImageArea) break;
          }
        }
        
        if (!mainImageArea) return { success: false, error: 'No 1:1主图 area found' };
        
        // Check for new images in the area
        const images = mainImageArea.querySelectorAll('img');
        const newImages = Array.from(images).filter(img => {
          const src = img.src || '';
          return src.startsWith('blob:') || src.startsWith('data:') || src.includes('alicdn');
        });
        
        // Check for success indicators
        const hasSuccessText = mainImageArea.textContent.includes('上传成功') || 
                              mainImageArea.textContent.includes('已上传');
        
        return { 
          success: newImages.length > 0 || hasSuccessText, 
          imageCount: newImages.length, 
          hasSuccessText,
          areaText: mainImageArea.textContent.substring(0, 200)
        };
      });
      
      console.log('[Taobao] Upload check:', JSON.stringify(uploadSuccess));
      
      if (uploadSuccess.success) {
        console.log(`[Taobao] ✓ Drag-and-drop uploaded, ${uploadSuccess.imageCount} new images found`);
        return true;
      }
    } catch (e) {
      console.log('[Taobao] Drag-and-drop failed:', e.message);
    }

    // Strategy 6: React fiber injection
    console.log('[Taobao] Trying React fiber injection...');
    try {
      const fiberResult = await page.evaluate(({ fileBufferBase64, fileName }) => {
        // Find React fiber root
        const rootEl = document.getElementById('root') || document.getElementById('app') || document.querySelector('[data-reactroot]');
        if (!rootEl) return { success: false, error: 'No React root found' };
        
        // Try to find upload handler in React component tree
        function findUploadHandler(fiber) {
          if (!fiber) return null;
          
          // Check for upload-related props
          const props = fiber.memoizedProps || fiber.pendingProps || {};
          if (props.onDrop || props.onChange || props.beforeUpload) {
            return { onDrop: props.onDrop, onChange: props.onChange, beforeUpload: props.beforeUpload };
          }
          
          // Check for upload-related state
          const state = fiber.memoizedState;
          if (state && state.queue && state.queue.lastRenderedState) {
            const stateVal = state.queue.lastRenderedState;
            if (typeof stateVal === 'object' && stateVal !== null) {
              if (stateVal.fileList || stateVal.file || stateVal.uploading) {
                return { state: stateVal };
              }
            }
          }
          
          // Recurse into child and sibling
          return findUploadHandler(fiber.child) || findUploadHandler(fiber.sibling);
        }
        
        // Try to get fiber from root element
        const fiberKey = Object.keys(rootEl).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
        if (!fiberKey) return { success: false, error: 'No React fiber found' };
        
        const fiber = rootEl[fiberKey];
        const handler = findUploadHandler(fiber);
        
        if (handler) {
          // Try to call the handler with a file
          const binaryString = atob(fileBufferBase64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const file = new File([bytes], fileName, { type: 'image/jpeg' });
          
          if (handler.onDrop) {
            handler.onDrop({ dataTransfer: { files: [file] } });
            return { success: true, method: 'onDrop' };
          }
          if (handler.onChange) {
            handler.onChange({ target: { files: [file] } });
            return { success: true, method: 'onChange' };
          }
        }
        
        return { success: false, error: 'No upload handler found' };
      }, { fileBufferBase64: fileBuffer.toString('base64'), fileName });
      
      console.log('[Taobao] React fiber result:', JSON.stringify(fiberResult));
      if (fiberResult.success) {
        await page.waitForTimeout(3000);
        return true;
      }
    } catch (e) {
      console.log('[Taobao] React fiber injection failed:', e.message);
    }

    console.log('[Taobao] ✗ No upload method worked');
    return false;
  } catch (e) {
    console.log('[Taobao] Image upload failed:', e.message);
    return false;
  }
}

// ========================================================
// submitAndVerify: click submit button and verify success
// ========================================================
async function submitAndVerify(page) {
  console.log('[Taobao] Attempting submit...');

  // Find and click submit button
  const submitTexts = ['提交宝贝信息', '提交宝贝', '保存草稿', '立刻上架', '放入仓库', '发布'];
  let clicked = false;
  for (const txt of submitTexts) {
    try {
      const btn = page.locator(`button:has-text("${txt}")`).first();
      if (await btn.count() > 0 && await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log(`[Taobao] Clicking submit: "${txt}"`);
        await btn.click();
        clicked = true;
        break;
      }
    } catch {}
  }

  if (!clicked) {
    // Try generic submit buttons
    try {
      const submitBtn = page.locator('button[type="submit"], button.ant-btn-primary').first();
      if (await submitBtn.count() > 0) {
        await submitBtn.click();
        clicked = true;
        console.log('[Taobao] Clicked generic submit button');
      }
    } catch {}
  }

  if (!clicked) {
    return { success: false, message: '未找到提交按钮' };
  }

  // Wait for response
  await page.waitForTimeout(2000);

  // Take screenshot immediately for diagnosis
  await page.screenshot({ path: join(SCREENSHOT_DIR, `after_submit_${Date.now()}.png`), fullPage: false });

  // Check for any visible dialog/modal first (Taobao shows confirmation or error dialogs)
  const dialogResult = await page.evaluate(() => {
    const body = document.body?.innerText || '';
    const url = window.location.href;

    // Check for modal/dialog containers
    const modalSelectors = [
      '[class*="dialog"]', '[class*="modal"]', '[class*="popup"]', '[class*="popover"]',
      '[class*="overlay"]', '[class*="drawer"]', '[class*="notification"]', '[class*="message"]',
      '[class*="toast"]', '[class*="alert"]', '[role="dialog"]', '[class*="confirm"]',
      '.next-dialog', '.next-overlay-wrapper', '.ant-modal',
    ];
    const visibleModals = [];
    for (const sel of modalSelectors) {
      try {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const r = el.getBoundingClientRect();
          if (r.width > 50 && r.height > 20) {
            const txt = (el.textContent || '').trim().substring(0, 300);
            if (txt) visibleModals.push({ sel, text: txt });
          }
        }
      } catch {}
    }

    // Success indicators
    const successTexts = ['发布成功', '上架成功', '提交成功', '商品发布成功', '恭喜', '成功发布'];
    const hasSuccessText = successTexts.some(t => body.includes(t));
    const isOnSuccessPage = url.includes('item.taobao.com/item') ||
                            url.includes('sell/publish/success') ||
                            url.includes('publish/complete');

    // Error indicators — broader search
    const errorTexts = ['请填写', '请选择', '不能为空', '必填', '错误', '失败', '请正确填写', '未填写', '未上传'];
    const errors = [];
    for (const t of errorTexts) {
      if (body.includes(t)) {
        const match = body.match(new RegExp(`[^。\\n]*${t}[^。\\n]*`, 'gi'));
        if (match) errors.push(...match.slice(0, 5));
        else errors.push(t);
      }
    }

    return {
      hasSuccessText,
      isOnSuccessPage,
      visibleModals,
      errors: [...new Set(errors)].slice(0, 8),
      currentUrl: url,
    };
  });

  console.log('[Taobao] Submit check:', JSON.stringify({
    success: dialogResult.hasSuccessText || dialogResult.isOnSuccessPage,
    modals: dialogResult.visibleModals.map(m => m.text.substring(0, 100)),
    errors: dialogResult.errors,
    url: dialogResult.currentUrl,
  }));

  // Report any visible dialogs
  if (dialogResult.visibleModals.length > 0) {
    for (const modal of dialogResult.visibleModals) {
      console.log(`[Taobao] Dialog [${modal.sel}]: "${modal.text.substring(0, 150)}"`);
    }
  }

  if (dialogResult.hasSuccessText || dialogResult.isOnSuccessPage) {
    const itemIdMatch = dialogResult.currentUrl.match(/id=(\d+)/);
    return {
      success: true,
      message: '发布成功',
      itemId: itemIdMatch ? itemIdMatch[1] : null,
    };
  }

  if (dialogResult.errors.length > 0) {
    return {
      success: false,
      message: `表单不完整: ${dialogResult.errors.slice(0, 3).join('; ')}`,
    };
  }

  // Check if still on publish page — likely validation blocked silently
  if (dialogResult.currentUrl.includes('publish')) {
    // Wait a bit and re-check
    await page.waitForTimeout(3000);
    const finalCheck = await page.evaluate(() => {
      const body = document.body?.innerText || '';
      return {
        hasSuccess: ['发布成功', '上架成功', '成功发布'].some(t => body.includes(t)),
        bodyPreview: body.substring(0, 800),
      };
    });

    if (finalCheck.hasSuccess) {
      return { success: true, message: '发布成功' };
    }

    // Return with form body so we can diagnose
    console.log('[Taobao] Page body preview:', finalCheck.bodyPreview.substring(0, 500));
    return { success: false, message: '提交后仍在发布页面，表单校验未通过（图片必填）' };
  }

  return { success: false, message: '提交结果未知' };
}
