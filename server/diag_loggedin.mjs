import { chromium } from 'playwright';

const PROFILE_DIR = 'D:\\software\\AI\\ClaudeCode\\taobao-dropship-tool\\server\\data\\pw-chrome-profile';

console.log('Launching Chrome with existing profile (should have login cookies)...');

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1400, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
  timeout: 30000,
});

const page = await context.newPage();
page.setDefaultTimeout(60000);

console.log('Navigating to publish page...');
await page.goto('https://item.upload.taobao.com/sell/v2/publish.htm?catId=125242010', {
  waitUntil: 'domcontentloaded',
  timeout: 30000,
});
console.log('URL:', page.url());
console.log('Title:', await page.title());

if (page.url().includes('login')) {
  console.log('LOGIN NEEDED - profile cookies may have expired');
  console.log('Please scan QR code in Chrome window.');
  for (let i = 0; i < 600; i++) {
    const url = page.url();
    if (!url.includes('login') && !url.includes('alogin')) {
      console.log('Login detected after', i, 'seconds!');
      break;
    }
    await page.waitForTimeout(1000);
  }
}

await page.waitForTimeout(5000);

console.log('\n===== ALL INPUTS =====');
const allInputs = await page.evaluate(() => {
  const inputs = document.querySelectorAll('input:not([type="hidden"])');
  return Array.from(inputs).map((inp, i) => {
    const r = inp.getBoundingClientRect();
    if (r.width < 10 || r.height < 5) return null;

    let labelText = '';
    let el = inp;
    for (let d = 0; d < 10 && el; d++) {
      const t = (el.textContent || '').trim();
      if (t.length > 0) { labelText = t.substring(0, 200); break; }
      el = el.parentElement;
    }

    let prevLabel = '';
    const prev = inp.previousElementSibling;
    if (prev) prevLabel = (prev.textContent || '').trim().substring(0, 60);

    return {
      idx: i,
      placeholder: (inp.placeholder || '').substring(0, 100),
      inputmode: inp.inputMode || '',
      id: inp.id || '',
      name: inp.name || '',
      className: (inp.className || '').substring(0, 80),
      value: (inp.value || '').substring(0, 30),
      top: Math.round(r.top),
      left: Math.round(r.left),
      w: Math.round(r.width),
      h: Math.round(r.height),
      prevLabel: prevLabel.substring(0, 100),
      labelText: labelText.substring(0, 200),
    };
  }).filter(Boolean);
});

allInputs.sort((a, b) => a.top - b.top);
console.log(JSON.stringify(allInputs, null, 2));

console.log('\n===== PRICE/STOCK LABELS =====');
const labels = await page.evaluate(() => {
  const results = [];
  const searchTexts = ['一口价', '价格', '售价', '库存', '数量', '元', '件'];
  const walker = document.createTreeWalker(document.body, 4, null, false);
  let node;
  while ((node = walker.nextNode())) {
    const t = (node.textContent || '').trim();
    if (!t || t.length > 30) continue;
    for (const kw of searchTexts) {
      if (t.includes(kw)) {
        const parent = node.parentElement;
        const rect = parent ? parent.getBoundingClientRect() : null;
        results.push({
          keyword: kw,
          text: t.substring(0, 50),
          top: rect ? Math.round(rect.top) : -1,
          left: rect ? Math.round(rect.left) : -1,
          tag: parent ? parent.tagName : '',
          id: parent ? (parent.id || '') : '',
          cls: parent ? (parent.className || '').substring(0, 60) : '',
        });
        break;
      }
    }
  }
  return results;
});

labels.sort((a, b) => a.top - b.top);
console.log(JSON.stringify(labels, null, 2));

console.log('\n===== IFRAMES =====');
const iframes = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('iframe')).map(f => ({
    src: (f.src || '').substring(0, 150),
    id: f.id || '',
    className: (f.className || '').substring(0, 60),
  }));
});
console.log(JSON.stringify(iframes, null, 2));

await page.screenshot({ path: 'C:\\tmp\\publish_dom.png', fullPage: true, timeout: 30000 });
console.log('\nScreenshot: C:\\tmp\\publish_dom.png');
console.log('\nDiagnosis complete!');