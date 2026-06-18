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
export const marker = 200;
