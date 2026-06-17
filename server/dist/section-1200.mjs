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
export async function batchListToTaobao(products, overrideCategory, overridePrices) {
  console.log(`[Taobao] Starting batch listing ${products.length} products...`);

  const context = await launchContext();
  const page = context.pages()[0] || await context.newPage();

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
    }
    try {
      await page.waitForFunction(() => {
        const u = window.location.href;
        return u.includes('myseller.taobao.com') || u.includes('item.upload.taobao.com');
      }, { timeout: 300000, polling: 3000 });
      await page.waitForTimeout(3000);
      console.log('[Taobao] Login completed');
    } catch(e) {
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
    // Use user-specified price if provided, otherwise fall back to product's selling_price or cost_price
    const price = (overridePrices && overridePrices[p.id]) || p.selling_price || p.cost_price || 0;
    // If overrideCategory contains a path like "茶>代用/花草/水果/再加工茶>组合型花茶", extract the last segment
    let cat = overrideCategory || resolveCategory(p);
    if (cat.includes('>')) {
      const parts = cat.split('>').map(s => s.trim()).filter(Boolean);
      cat = parts[parts.length - 1];
      console.log(`[Taobao] Extracted leaf category from path: "${cat}"`);
    }
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

export const marker = 1200;
