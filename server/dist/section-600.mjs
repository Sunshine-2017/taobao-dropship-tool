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
export const marker = 600;
