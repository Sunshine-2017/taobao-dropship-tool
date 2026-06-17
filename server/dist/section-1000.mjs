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
    const body = document.body?.innerText || '';
    const url = window.location.href;
    const successTexts = ['发布成功', '上架成功', '提交成功', '商品发布成功', '成功发布'];
    const hasSuccess = successTexts.some(t => body.includes(t));
    const onSuccessPage = url.includes('sell/publish/success') || url.includes('publish/complete');

    const errorTexts = ['请填写', '请选择', '不能为空', '必填', '错误', '请正确填写', '未填写', '未上传'];
    const errors = [];
export const marker = 1000;
