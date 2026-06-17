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

export const marker = 800;
