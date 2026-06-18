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
export const marker = 400;
