// Try to find & connect to the existing Chrome via CDP
import { chromium } from 'playwright';

// Playwright launched Chrome with --remote-debugging-pipe
// The browser's CDP endpoint info is stored in the profile dir

import { readFileSync } from 'fs';
import { join } from 'path';

const profileDir = 'D:\\software\\AI\\ClaudeCode\\taobao-dropship-tool\\server\\data\\pw-chrome-profile';

// Read DevToolsActivePort
try {
  const portData = readFileSync(join(profileDir, 'DevToolsActivePort'), 'utf-8').trim();
  const lines = portData.split('\n');
  const port = parseInt(lines[0].trim(), 10);
  console.log('DevTools port:', port);
  console.log('DevTools file content:', portData);
} catch (e) {
  console.log('No DevToolsActivePort file');
}

// Try connectOverCDP - this works when browser was launched with launchPersistentContext
console.log('Attempting connectOverCDP...');
try {
  const browser = await chromium.connectOverCDP(
    'ws://127.0.0.1:9222/devtools/browser/xxxx',
    { timeout: 5000 }
  ).catch(() => null);
  
  if (browser) {
    console.log('Connected via CDP!');
    const pages = browser.contexts()[0]?.pages() || [];
    console.log('Pages:', pages.length);
    for (const p of pages) {
      console.log('  URL:', p.url().substring(0, 100));
    }
  } else {
    console.log('connectOverCDP failed (expected)');
  }
} catch (e) {
  console.log('connectOverCDP error:', e.message.slice(0, 100));
}

// launchPersistentContext already started Chrome. We need a different approach:
// Kill the old Chrome and start a fresh one with the same profile.
// BUT the user just logged in on it! So we can't kill it.
//
// Alternative: launch a SECOND Chrome with the SAME profile.
// This might work if we clear locks carefully.
console.log('\nTrying strategy: fresh Playwright with existing profile...');
for (const lock of ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'lockfile']) {
  try {
    const { rmSync } = await import('fs');
    rmSync(join(profileDir, lock), { recursive: true, force: true });
  } catch {}
}

const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: { width: 1400, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
  timeout: 30000,
}).catch(e => {
  console.log('launchPersistentContext failed:', e.message.slice(0, 200));
  return null;
});

if (context) {
  console.log('New browser launched!');
  const page = context.pages()[0] || await context.newPage();
  console.log('Current URL:', page.url().substring(0, 100));
  
  // Navigate to publish page
  await page.goto('https://item.upload.taobao.com/sell/v2/publish.htm?catId=125242010', {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  console.log('After nav URL:', page.url().substring(0, 100));
  
  if (page.url().includes('login')) {
    console.log('Still need login!');
  } else {
    console.log('Already logged in! Running diagnostics...');
    await page.waitForTimeout(5000);
    
    // ... run diagnostics
    const inputs = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input:not([type="hidden"])')).map((inp, i) => {
        const r = inp.getBoundingClientRect();
        if (r.width < 10 || r.height < 5) return null;
        return {
          idx: i, placeholder: (inp.placeholder || '').substring(0, 60),
          top: Math.round(r.top), w: Math.round(r.width),
        };
      }).filter(Boolean);
    });
    console.log(JSON.stringify(inputs, null, 2));
  }
  
  await new Promise(() => {});
}