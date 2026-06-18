const { chromium } = await import('playwright');
const tmpProf = 'D:\\software\\AI\\ClaudeCode\\taobao-dropship-tool\\server\\data\\taobao-diag-v2';

console.log('Launching browser with persistent context...');
const context = await chromium.launchPersistentContext(tmpProf, {
  headless: false,
  viewport: { width: 1400, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
  timeout: 60000,
});
const page = context.pages()[0] || await context.newPage();
page.setDefaultTimeout(60000);

console.log('Navigating to publish page...');
await page.goto('https://item.upload.taobao.com/sell/v2/publish.htm?catId=125242010', {
  waitUntil: 'domcontentloaded', timeout: 30000,
});
await page.waitForTimeout(3000);
console.log('URL:', page.url());

if (page.url().includes('login')) {
  console.log('LOGIN REQUIRED! Waiting up to 5 min...');
  for (let i = 0; i < 300; i++) {
    const u = page.url();
    if (!u.includes('login') && !u.includes('alogin')) {
      console.log('Login detected at', i, 's');
      break;
    }
    await page.waitForTimeout(1000);
  }
}

await page.waitForTimeout(3000);

console.log('\n=== ALL INPUTS ===');
const inputs = await page.evaluate(() => {
  const all = document.querySelectorAll('input:not([type="hidden"]):not([type="radio"])');
  return Array.from(all).map((inp, i) => {
    const r = inp.getBoundingClientRect();
    if (r.width < 10 || r.height < 5) return null;
    let chain = [];
    let el = inp;
    for (let d = 0; d < 8 && el; d++) {
      const t = (el.textContent || '').trim().substring(0, 100);
      chain.push(`${el.tagName} class="${(el.className||'').substring(0,40)}" id="${(el.id||'').substring(0,20)}" TEXT="${t}"`);
      el = el.parentElement;
    }
    return {
      i, type: inp.type, ph: (inp.placeholder||'').substring(0,60),
      im: inp.inputMode||'', id: (inp.id||'').substring(0,30),
      nm: (inp.name||'').substring(0,30),
      cls: (inp.className||'').substring(0,40),
      top: Math.round(r.top), left: Math.round(r.left),
      w: Math.round(r.width), h: Math.round(r.height),
      chain: chain.slice(0,5),
    };
  }).filter(Boolean);
});
inputs.sort((a,b) => a.top - b.top);
inputs.forEach(x => {
  console.log(`[${x.i}] top=${x.top} w=${x.w} type=${x.type} ph="${x.ph}" im="${x.im}" id="${x.id}" nm="${x.nm}"`);
  x.chain.forEach(c => console.log(`  → ${c}`));
});

console.log('\n=== LABELS ===');
const labels = await page.evaluate(() => {
  const r = [];
  for (const kw of ['一口价','价格','售价','市场价','库存','数量','元','件']) {
    const w = document.createTreeWalker(document.body, 4, null, false);
    let n;
    while ((n = w.nextNode())) {
      const t = (n.textContent||'').trim();
      if (!t || t.length>40 || !t.includes(kw)) continue;
      const p = n.parentElement;
      const rect = p?.getBoundingClientRect();
      r.push({ kw, text: t.substring(0,40), tag: p?.tagName, cls: (p?.className||'').substring(0,40), top: rect ? Math.round(rect.top) : -1 });
      break;
    }
  }
  return r;
});
labels.forEach(x => console.log(`  kw="${x.kw}" text="${x.text}" tag=${x.tag} top=${x.top}`));

await page.screenshot({ path: 'C:\\tmp\\publish_dom_diag.png', fullPage: false, timeout: 10000 });
console.log('\nScreenshot: C:\\tmp\\publish_dom_diag.png');

console.log('Done! Browser stays open.');
await new Promise(() => {});
