const PROFILE_DIR = 'D:\\software\\AI\\ClaudeCode\\taobao-dropship-tool\\server\\data\\taobao-profile';
import { chromium } from 'playwright';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

try { execSync('taskkill /F /IM msedge.exe 2>nul', { stdio: 'ignore' }); } catch {}
for (const lock of ['SingletonLock','SingletonSocket','SingletonCookie','lockfile']) {
  const p = join(PROFILE_DIR, lock);
  if (existsSync(p)) { try { rmSync(p, { recursive: true, force: true }); } catch {} }
}
await new Promise(r => setTimeout(r, 2000));

console.log('Launching...');
const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false, channel: 'msedge',
  viewport: { width: 1400, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
  timeout: 30000,
});
const page = await context.newPage();
page.setDefaultTimeout(60000);

console.log('Navigating to publish page...');
await page.goto('https://item.upload.taobao.com/sell/v2/publish.htm?catId=125242010', {
  waitUntil: 'domcontentloaded', timeout: 30000,
});
console.log('URL:', page.url());
await page.waitForTimeout(3000);

const result = await page.evaluate(() => {
  const inputs = document.querySelectorAll("input:not([type='hidden']):not([type='radio'])");
  return Array.from(inputs).map((inp, i) => {
    const r = inp.getBoundingClientRect();
    if (r.width < 10 || r.height < 5) return null;
    let chain = [];
    let el = inp;
    for (let d = 0; d < 8 && el; d++) {
      const t = (el.textContent || '').trim();
      chain.push({
        tag: el.tagName,
        cls: (el.className || '').substring(0, 60),
        id: (el.id || '').substring(0, 40),
        text: t.substring(0, 80),
      });
      el = el.parentElement;
    }
    return {
      idx: i,
      placeholder: (inp.placeholder || '').substring(0, 60),
      inputmode: inp.inputMode || '',
      type: inp.type,
      id: (inp.id || '').substring(0, 40),
      name: (inp.name || '').substring(0, 40),
      top: Math.round(r.top),
      left: Math.round(r.left),
      w: Math.round(r.width),
      h: Math.round(r.height),
      chain: chain,
    };
  }).filter(Boolean);
});

console.log('=== ALL VISIBLE INPUTS ===');
console.log(JSON.stringify(result, null, 2));
await page.screenshot({ path: 'C:\\tmp\\publish_dom_diag.png', fullPage: true });
console.log('Screenshot saved.');
