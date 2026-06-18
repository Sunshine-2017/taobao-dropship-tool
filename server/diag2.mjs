import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, args: [] });
const page = await browser.newPage();
await page.goto("https://item.upload.taobao.com/sell/v2/publish.htm?catId=125242010", { waitUntil: "networkidle", timeout: 60000 }).catch(e => console.log("nav err:", e.message));
await page.waitForTimeout(5000);
const inputs = await page.evaluate(() => {
  const all = document.querySelectorAll("input:not([type=hidden])");
  return Array.from(all).map((inp, i) => {
    const r = inp.getBoundingClientRect();
    let p = inp.parentElement;
    let parentText = "";
    for (let d = 0; d < 6 && p; d++) {
      const t = (p.textContent || "").trim();
      parentText = t.substring(0, 200);
      if (t.includes("\u4ef7") || t.includes("\u5e93\u5b58") || t.includes("\u53e3") || t.includes("\u5143")) break;
      p = p.parentElement;
    }
    return {
      idx: i,
      tag: inp.tagName,
      type: inp.type,
      placeholder: inp.placeholder,
      width: Math.round(r.width),
      height: Math.round(r.height),
      top: Math.round(r.top),
      left: Math.round(r.left),
      parentTextSnippet: parentText.substring(0, 150),
    };
  });
});
console.log("=== ALL VISIBLE INPUTS ===");
inputs.forEach(inp => {
  if (inp.width > 30 && inp.height > 10) {
    console.log(JSON.stringify(inp));
  }
});
await browser.close();
