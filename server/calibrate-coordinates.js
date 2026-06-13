/**
 * Coordinate Calibration Tool
 *
 * Interactive tool to help identify element positions on Taobao publish page.
 * Takes screenshots and allows user to click on elements to record coordinates.
 */

import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { chromium } from 'playwright';

const PROJECT_ROOT = process.cwd();
const SCREENSHOT_DIR = join(PROJECT_ROOT, 'data', 'screenshots');
const COORDINATES_FILE = join(PROJECT_ROOT, 'data', 'element-coordinates.json');

// Ensure directory exists
if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true });

/**
 * Launch browser and navigate to Taobao publish page
 */
async function openPublishPage() {
  console.log('🚀 Opening browser...');

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN'
  });

  const page = await context.newPage();

  // Navigate to seller center
  console.log('📍 Navigating to Taobao seller center...');
  await page.goto('https://myseller.taobao.com/home.htm', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  const url = page.url();
  console.log('   Current URL:', url);

  if (url.includes('login')) {
    console.log('⚠️  Please login in the browser window...');
    console.log('   Waiting for login...');
    await page.waitForURL('**/myseller.taobao.com/**', { timeout: 120000 });
  }

  console.log('✅ Logged in successfully');

  // Navigate to publish page
  console.log('📍 Navigating to publish page...');
  await page.goto('https://item.upload.taobao.com/sell/ai/category.htm?force=true', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  console.log('✅ Publish page loaded');
  return { browser, context, page };
}

/**
 * Take screenshot with overlay showing clickable areas
 */
async function takeCalibrationScreenshot(page, name) {
  const path = join(SCREENSHOT_DIR, `calibrate-${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`📸 Screenshot saved: calibrate-${name}.png`);
  return path;
}

/**
 * Add click listener to record coordinates
 */
async function enableCoordinateRecording(page) {
  const coordinates = {};

  await page.evaluate(() => {
    window.__recordedCoordinates = {};

    // Add click overlay
    const overlay = document.createElement('div');
    overlay.id = 'coord-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 99999;
      cursor: crosshair;
    `;
    overlay.addEventListener('click', (e) => {
      const x = e.clientX;
      const y = e.clientY;
      const target = e.target;

      // Get element info
      const elementInfo = {
        tagName: target.tagName,
        id: target.id,
        className: target.className,
        text: target.textContent?.substring(0, 50)
      };

      // Store coordinate
      window.__recordedCoordinates[`${x},${y}`] = {
        x,
        y,
        element: elementInfo
      };

      // Show feedback
      const marker = document.createElement('div');
      marker.style.cssText = `
        position: fixed;
        left: ${x - 10}px;
        top: ${y - 10}px;
        width: 20px;
        height: 20px;
        background: red;
        border-radius: 50%;
        z-index: 100000;
        pointer-events: none;
      `;
      document.body.appendChild(marker);

      console.log(`Clicked at (${x}, ${y})`, elementInfo);
    });

    document.body.appendChild(overlay);
  });

  return coordinates;
}

/**
 * Get recorded coordinates from page
 */
async function getRecordedCoordinates(page) {
  return await page.evaluate(() => window.__recordedCoordinates || {});
}

/**
 * Main calibration flow
 */
export async function calibrate() {
  console.log('🎯 Taobao Element Coordinate Calibration Tool');
  console.log('='.repeat(50));
  console.log('');
  console.log('This tool will help you identify the coordinates of');
  console.log('form elements on the Taobao publish page.');
  console.log('');

  const { browser, context, page } = await openPublishPage();

  try {
    // Take initial screenshot
    await takeCalibrationScreenshot(page, '01-publish-page');

    console.log('');
    console.log('📍 Page loaded. Now you can click on elements to record their coordinates.');
    console.log('   Click on each of these elements:');
    console.log('   1. Category search field');
    console.log('   2. Title field');
    console.log('   3. Price field');
    console.log('   4. Stock field');
    console.log('   5. Image upload area');
    console.log('   6. Description field');
    console.log('   7. Submit button');
    console.log('');

    // Enable coordinate recording
    await enableCoordinateRecording(page);

    // Wait for user to click on elements
    console.log('⏳ Waiting for clicks... (Press Ctrl+C when done)');
    console.log('');

    // Keep browser open for clicking
    await new Promise((resolve) => {
      process.on('SIGINT', async () => {
        console.log('\n');
        console.log('📊 Recording coordinates...');

        // Get recorded coordinates
        const coords = await getRecordedCoordinates(page);

        // Take final screenshot
        await takeCalibrationScreenshot(page, '02-clicks-recorded');

        // Save coordinates
        const formattedCoords = {};
        for (const [key, value] of Object.entries(coords)) {
          const [x, y] = key.split(',').map(Number);
          formattedCoords[value.element?.tagName || `point_${x}_${y}`] = {
            x,
            y,
            element: value.element
          };
        }

        writeFileSync(COORDINATES_FILE, JSON.stringify(formattedCoords, null, 2));
        console.log('✅ Coordinates saved to element-coordinates.json');
        console.log('');
        console.log('Next steps:');
        console.log('1. Review the coordinates file');
        console.log('2. Map coordinates to element names (titleField, priceField, etc.)');
        console.log('3. Run auto-listing with saved coordinates');

        resolve();
      });
    });

  } finally {
    await browser.close();
  }
}

/**
 * Quick calibration: Use fixed coordinates based on common layout
 */
export async function quickCalibrate() {
  console.log('⚡ Quick Calibration Mode');
  console.log('='.repeat(50));
  console.log('');
  console.log('Using estimated coordinates based on common Taobao layout.');
  console.log('These may need adjustment for your specific page.');
  console.log('');

  // Common coordinates for Taobao publish page (1280x900 viewport)
  const estimatedCoords = {
    categorySearch: { x: 400, y: 200, note: 'Category search input field' },
    categoryResult: { x: 400, y: 250, note: 'First category search result' },
    titleField: { x: 400, y: 350, note: 'Product title textarea' },
    priceField: { x: 400, y: 450, note: 'Price input field' },
    stockField: { x: 400, y: 500, note: 'Stock input field' },
    imageUpload: { x: 200, y: 600, note: 'Image upload area' },
    descriptionField: { x: 400, y: 700, note: 'Description editor' },
    submitButton: { x: 600, y: 800, note: 'Submit button (立刻上架)' }
  };

  writeFileSync(COORDINATES_FILE, JSON.stringify(estimatedCoords, null, 2));
  console.log('✅ Estimated coordinates saved to element-coordinates.json');
  console.log('');
  console.log('⚠️  These are estimates. Please run `calibrate` command to get accurate coordinates.');

  return estimatedCoords;
}

// Run if executed directly
if (process.argv[1] === import.meta.url) {
  const command = process.argv[2];

  if (command === 'quick') {
    quickCalibrate();
  } else {
    calibrate();
  }
}
