import { chromium } from "playwright";
import { join } from "path";
import { rmSync } from "fs";

const USER_DATA_DIR = "D:\\software\\AI\\ClaudeCode\\taobao-dropship-tool\\data\\taobao-profile";
for (const lock of ["SingletonLock","SingletonSocket","SingletonCookie","lockfile"]) {
  try { rmSync(join(USER_DATA_DIR, lock), { recursive: true, force: true }); } catch {}
}

const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
  headless: false,
  channel: "msedge",
  viewport: { width: 1280, height: 900 },
  args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
  timeout: 30000,
});
const page = await context.newPage();
await page.goto("https://item.upload.taobao.com/sell/v2/publish.htm?catId=125242010", { waitUntil: "domcontentloaded", timeout: 30000 }).catch(e => console.log("nav err:", e.message));
console.log("URL:", page.url());

if (page.url().includes("login")) {
  console.log("LOGIN REQUIRED - please scan QR code, you have 5 minutes");
  await page.waitForFunction(() => !window.location.href.includes("login"), { timeout: 300000, polling: 2000 });
  await page.waitForTimeout(5000);
  console.log("Login detected! URL:", page.url());
}

// Dump ALL inputs
const inputs = await page.evaluate(() => {
  const all = document.querySelectorAll("input:not([type=hidden])");
  return Array.from(all).map((inp, i) => {
    const r = inp.getBoundingClientRect();
    let p = inp.parentElement;
    let parentText = "";
    for (let d = 0; d < 8 && p; d++) {
      parentText = (p.textContent || "").trim().substring(0, 200);
      if (parentText.includes("\u4ef7") || parentText.includes("\u5e93\u5b58") || parentText.includes("\u5143")) break;
      p = p.parentElement;
    }
    return {
      idx: i,
      placeholder: inp.placeholder,
      type: inp.type,
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      left: Math.round(r.left),
      parentText: parentText.substring(0, 120),
    };
  });
});
console.log("\\n=== ALL INPUTS (w>30 h>10) ===");
inputs.forEach(inp => { if (inp.w > 30 && inp.h > 10) console.log(JSON.stringify(inp)); });

// Look for price/stock specific
const priceQty = await page.evaluate(() => {
  const inputs = document.querySelectorAll("input");
  const result = [];
  for (const inp of inputs) {
    const r = inp.getBoundingClientRect();
    if (r.width < 20 || r.height < 5) continue;
    let el = inp;
    let found = "";
    for (let d = 0; d < 8 && el; d++) {
      const t = (el.textContent || "").trim();
      if (t.includes("\u4ef7") || t.includes("\u5e93\u5b58") || t.includes("\u91cf")) {
        found = t.substring(0, 100);
        break;
      }
      el = el.parentElement;
    }
    if (found) {
      result.push({ placeholder: inp.placeholder, top: Math.round(r.top), w: Math.round(r.width), found: found });
    }
  }
  return result;
});
console.log("\\n=== Price/Stock inputs ===");
priceQty.forEach(x => console.log(JSON.stringify(x)));

await page.screenshot({ path: "C:\\tmp\\publish_dom.png", fullPage: true });
console.log("Screenshot saved");
// Keep browser open for inspection
console.log("Browser stays open. Press Ctrl+C to close.");
await new Promise(() => {});
