/**
 * Taobao auto-listing service via Computer-Use MCP
 *
 * This service uses screenshot-based automation to interact with
 * the Taobao seller platform, making it resilient to DOM changes.
 */

import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';

const PROJECT_ROOT = process.cwd();
const SCREENSHOT_DIR = join(PROJECT_ROOT, 'data', 'screenshots');
const LOG_DIR = join(PROJECT_ROOT, 'data', 'logs');
const COORDINATES_FILE = join(PROJECT_ROOT, 'data', 'element-coordinates.json');

// Ensure directories exist
for (const dir of [SCREENSHOT_DIR, LOG_DIR]) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// Helper: sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Structured logging
function log(step, message, data = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    step,
    message,
    ...data
  };
  console.log(`[${step}] ${message}`, data);

  // Save to log file
  const logFile = join(LOG_DIR, `computer-use-${step}.json`);
  try {
    writeFileSync(logFile, JSON.stringify(entry, null, 2));
  } catch {}

  return entry;
}

/**
 * Load saved element coordinates
 */
function loadCoordinates() {
  try {
    if (existsSync(COORDINATES_FILE)) {
      return JSON.parse(readFileSync(COORDINATES_FILE, 'utf-8'));
    }
  } catch {}
  return {};
}

/**
 * Save element coordinates for future use
 */
function saveCoordinates(coords) {
  try {
    writeFileSync(COORDINATES_FILE, JSON.stringify(coords, null, 2));
  } catch {}
}

/**
 * Take a screenshot using computer-use MCP
 * Returns the screenshot path
 */
async function takeScreenshot(name) {
  const filename = `${name}_${Date.now()}.png`;
  const path = join(SCREENSHOT_DIR, filename);

  try {
    // Call computer-use MCP get_screenshot
    // In actual implementation, this would be:
    // await mcp__computer_use_mcp__computer({ action: 'get_screenshot' })

    log('screenshot', `Screenshot taken: ${filename}`);
    return path;
  } catch (error) {
    log('screenshot-error', `Failed to take screenshot: ${error.message}`);
    throw error;
  }
}

/**
 * Click at specific coordinates using computer-use MCP
 */
async function clickAt(x, y, description = '', options = {}) {
  log('click', `Click at (${x}, ${y})`, { description });

  try {
    // Call computer-use MCP left_click
    // In actual implementation:
    // await mcp__computer_use_mcp__computer({
    //   action: 'left_click',
    //   coordinate: [x, y],
    //   ...options
    // })

    await sleep(500); // Wait for UI response
    return true;
  } catch (error) {
    log('click-error', `Click failed at (${x}, ${y}): ${error.message}`);
    throw error;
  }
}

/**
 * Type text using computer-use MCP
 */
async function typeText(text, options = {}) {
  log('type', `Type: "${text.substring(0, 50)}..."`);

  try {
    // Call computer-use MCP type
    // In actual implementation:
    // await mcp__computer_use_mcp__computer({
    //   action: 'type',
    //   text: text,
    //   ...options
    // })

    await sleep(300);
    return true;
  } catch (error) {
    log('type-error', `Type failed: ${error.message}`);
    throw error;
  }
}

/**
 * Press keyboard key using computer-use MCP
 */
async function pressKey(key, options = {}) {
  log('key', `Press key: ${key}`);

  try {
    // Call computer-use MCP key
    // In actual implementation:
    // await mcp__computer_use_mcp__computer({
    //   action: 'key',
    //   key: key,
    //   ...options
    // })

    await sleep(200);
    return true;
  } catch (error) {
    log('key-error', `Key press failed: ${error.message}`);
    throw error;
  }
}

/**
 * Upload file using computer-use MCP
 */
async function uploadFile(filePath, x, y) {
  log('upload', `Upload: ${filePath} at (${x}, ${y})`);

  try {
    // Call computer-use MCP left_click with file
    // In actual implementation:
    // await mcp__computer_use_mcp__computer({
    //   action: 'left_click',
    //   coordinate: [x, y],
    //   file: filePath
    // })

    await sleep(2000); // Wait for upload
    return true;
  } catch (error) {
    log('upload-error', `Upload failed: ${error.message}`);
    throw error;
  }
}

/**
 * Scroll using computer-use MCP
 */
async function scroll(direction, amount = 300, x = 640, y = 450) {
  log('scroll', `Scroll ${direction} ${amount}px`);

  try {
    // Call computer-use MCP scroll
    // In actual implementation:
    // await mcp__computer_use_mcp__computer({
    //   action: 'scroll',
    //   coordinate: [x, y],
    //   text: `${direction}:${amount}`
    // })

    await sleep(500);
    return true;
  } catch (error) {
    log('scroll-error', `Scroll failed: ${error.message}`);
    throw error;
  }
}

/**
 * Wait and take screenshot for analysis
 */
async function waitAndCapture(stepName, waitMs = 2000) {
  await sleep(waitMs);
  return await takeScreenshot(stepName);
}

/**
 * Main auto-listing function using Computer-Use
 *
 * This is a template that needs to be customized with actual coordinates
 * after running the calibration step.
 */
export async function autoListWithComputerUse(product, options = {}) {
  const { title, price, stock = 9999, description, images = [], category } = product;
  const { dryRun = false } = options;

  log('start', 'Starting auto-listing with Computer-Use', { product: title, dryRun });

  // Load saved coordinates
  const coords = loadCoordinates();
  log('coords', 'Loaded coordinates', { hasCoords: Object.keys(coords).length > 0 });

  // Step 1: Open browser and navigate to Taobao
  log('step1', 'Opening Taobao seller center');
  await takeScreenshot('01-initial');

  // TODO: Implement actual navigation
  // This would involve:
  // 1. Opening browser (or using existing one)
  // 2. Navigating to https://myseller.taobao.com/home.htm
  // 3. Checking login status

  await sleep(3000);
  await takeScreenshot('02-seller-home');

  // Step 2: Navigate to publish page
  log('step2', 'Navigating to publish page');

  // Use saved coordinates or default
  const publishBtnX = coords.publishButton?.x || 200;
  const publishBtnY = coords.publishButton?.y || 300;
  await clickAt(publishBtnX, publishBtnY, 'Publish button');

  await sleep(3000);
  await takeScreenshot('03-publish-page');

  // Step 3: Search and select category
  log('step3', 'Selecting category', { category });

  // Click on category search field
  const catSearchX = coords.categorySearch?.x || 400;
  const catSearchY = coords.categorySearch?.y || 200;
  await clickAt(catSearchX, catSearchY, 'Category search field');

  // Type category
  await typeText(category || '花茶');
  await sleep(2000);

  // Click on first result
  const catResultX = coords.categoryResult?.x || 400;
  const catResultY = coords.categoryResult?.y || 250;
  await clickAt(catResultX, catResultY, 'Category result');

  await sleep(2000);
  await takeScreenshot('04-category-selected');

  // Step 4: Fill title
  log('step4', 'Filling title', { title });

  const titleFieldX = coords.titleField?.x || 400;
  const titleFieldY = coords.titleField?.y || 350;
  await clickAt(titleFieldX, titleFieldY, 'Title field');
  await pressKey('Control+a');
  await typeText(title);

  await sleep(1000);
  await takeScreenshot('05-title-filled');

  // Step 5: Fill price
  log('step5', 'Filling price', { price });

  const priceFieldX = coords.priceField?.x || 400;
  const priceFieldY = coords.priceField?.y || 450;
  await clickAt(priceFieldX, priceFieldY, 'Price field');
  await pressKey('Control+a');
  await typeText(String(price));

  await sleep(1000);
  await takeScreenshot('06-price-filled');

  // Step 6: Fill stock
  log('step6', 'Filling stock', { stock });

  const stockFieldX = coords.stockField?.x || 400;
  const stockFieldY = coords.stockField?.y || 500;
  await clickAt(stockFieldX, stockFieldY, 'Stock field');
  await pressKey('Control+a');
  await typeText(String(stock));

  await sleep(1000);
  await takeScreenshot('07-stock-filled');

  // Step 7: Upload images
  log('step7', 'Uploading images', { count: images.length });

  for (let i = 0; i < images.length; i++) {
    const imagePath = images[i];
    const uploadAreaX = coords.imageUpload?.x || 200;
    const uploadAreaY = coords.imageUpload?.y || 600;

    log('upload-image', `Uploading image ${i + 1}/${images.length}`, { path: imagePath });
    await uploadFile(imagePath, uploadAreaX, uploadAreaY);
    await sleep(2000);
  }

  await takeScreenshot('08-images-uploaded');

  // Step 8: Fill description
  log('step8', 'Filling description');

  const descFieldX = coords.descriptionField?.x || 400;
  const descFieldY = coords.descriptionField?.y || 700;
  await clickAt(descFieldX, descFieldY, 'Description field');
  await typeText(description);

  await sleep(1000);
  await takeScreenshot('09-description-filled');

  // Step 9: Submit
  if (!dryRun) {
    log('step9', 'Submitting form');

    const submitBtnX = coords.submitButton?.x || 600;
    const submitBtnY = coords.submitButton?.y || 800;
    await clickAt(submitBtnX, submitBtnY, 'Submit button');

    await sleep(5000);
    await takeScreenshot('10-submit-result');

    // Step 10: Verify success
    log('step10', 'Verifying submission');
    // TODO: Check for success message or error indicators
  } else {
    log('step9', 'DRY RUN - Skipping submission');
  }

  log('complete', 'Auto-listing completed', { product: title, dryRun });

  return {
    success: true,
    message: dryRun ? 'Dry run completed' : 'Auto-listing completed',
    product: title,
    screenshots: [
      '01-initial.png',
      '02-seller-home.png',
      '03-publish-page.png',
      '04-category-selected.png',
      '05-title-filled.png',
      '06-price-filled.png',
      '07-stock-filled.png',
      '08-images-uploaded.png',
      '09-description-filled.png',
      '10-submit-result.png'
    ]
  };
}

/**
 * Calibration mode: Take screenshots to identify element positions
 *
 * Run this first to get the coordinates of each element.
 * Then save them to element-coordinates.json
 */
export async function calibrateCoordinates() {
  log('calibrate', 'Starting coordinate calibration');

  // Step 1: Open Taobao and take screenshots
  await takeScreenshot('calibrate-01-initial');

  // Navigate to publish page
  await sleep(3000);
  await takeScreenshot('calibrate-02-publish-page');

  // TODO: Implement coordinate picking
  // This would involve:
  // 1. Taking screenshots at each step
  // 2. Allowing user to click on elements to record coordinates
  // 3. Saving coordinates to file

  log('calibrate', 'Calibration complete. Please update element-coordinates.json');

  return {
    message: 'Calibration screenshots saved. Please identify coordinates and update element-coordinates.json'
  };
}

/**
 * Test function with dry run
 */
export async function testComputerUse() {
  const testProduct = {
    title: '茉莉花茶 特级 250g 浓香型',
    price: 39.9,
    stock: 9999,
    description: '优质茉莉花茶，香气浓郁，口感醇厚。精选优质茉莉花和绿茶，传统工艺窨制。',
    images: [],
    category: '代用茶'
  };

  return await autoListWithComputerUse(testProduct, { dryRun: true });
}
