import { chromium } from 'playwright';
import { join, resolve } from 'path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';

const PROJECT_ROOT = resolve(import.meta.url.replace('file:///', ''), '..');
const USER_DATA_DIR = join(PROJECT_ROOT, 'data', 'taobao-profile');
const SCREENSHOT_DIR = join(PROJECT_ROOT, 'data', 'screenshots');

console.log('Project root:', PROJECT_ROOT);
console.log('Profile dir:', USER_DATA_DIR);
console.log('Dist package.json exists:', existsSync(join(PROJECT_ROOT, 'dist', 'package.json')));

// Clean locks
for (const lock of ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'lockfile']) {
  try { rmSync(join(USER_DATA_DIR, lock), { recursive: true, force: true }); } catch {}
}

// Try launch
const browserChannel = process.env.BROWSER_CHANNEL || 'chrome';
console.log('Launching browser with channel:', browserChannel);

const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
  headless: false,
  channel: browserChannel,
  viewport: { width: 1280, height: 900 },
  locale: 'zh-CN',
  timeout: 30000,
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-session-crashed-bubble',
    '--no-first-run',
    '--no-default-browser-check',
    '--start-maximized',
  ],
});

const page = context.pages()[0] || await context.newPage();

// Login check
await page.goto('https://qn.taobao.com/home.html/SellManage/on_sale?current=1&pageSize=20', {
  waitUntil: 'domcontentloaded', timeout: 30000,
}).catch(e => console.log('Nav error:', e.message));

await page.waitForTimeout(5000);
const url = page.url();
console.log('URL after login check:', url);

const isLoggedIn = (url.includes('myseller.taobao.com') && !url.includes('login')) ||
  url.includes('item.upload.taobao.com') || url.includes('qn.taobao.com/home.html/SellManage');

if (!isLoggedIn) {
  if (url.includes('login') || url.includes('passport')) {
    console.log('⛔ Redirected to login page. Waiting 5 min for QR scan...');
    try {
      await page.waitForFunction(() => {
        const u = window.location.href;
        return u.includes('myseller.taobao.com') || u.includes('item.upload.taobao.com');
      }, { timeout: 300000, polling: 2000 });
      console.log('✓ Login detected!');
      await page.waitForTimeout(3000);
    } catch(e) {
      console.log('✗ Login timeout');
      await context.close();
      process.exit(1);
    }
  }
}

console.log('✓ Already logged in or login completed');

// Navigate to AI category page
await page.goto('https://item.upload.taobao.com/sell/ai/category.htm?force=true', {
  waitUntil: 'domcontentloaded', timeout: 30000,
}).catch(e => console.log('Nav error:', e.message));
await page.waitForTimeout(3000);
console.log('Category page URL:', page.url());

// Check content
const hasContent = await page.evaluate(() => {
  const body = document.body?.innerText || '';
  return body.includes('搜索发品') || body.includes('以图发品') || body.includes('推荐发品') || body.includes('类目');
});
console.log('Has category content:', hasContent);

if (!hasContent) {
  const preview = await page.evaluate(() => (document.body?.innerText || '').substring(0, 300));
  console.log('Body preview:', preview);
  await page.screenshot({ path: join(SCREENSHOT_DIR, 'e2e_debug.png'), fullPage: false }).catch(() => {});
}

await page.waitForTimeout(60000);
await context.close();
console.log('Done');
