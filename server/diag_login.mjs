import { chromium } from "playwright";
import { join } from "path";
const PROJECT_ROOT = "D:\\software\\AI\\ClaudeCode\\taobao-dropship-tool";
const USER_DATA_DIR = join(PROJECT_ROOT, "data", "taobao-profile");
// Clean locks
import { rmSync } from "fs";
for (const lock of ["SingletonLock", "SingletonSocket", "SingletonCookie", "lockfile"]) {
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
console.log("Current URL:", page.url());
// Wait for user to login (up to 3 min)
console.log("Waiting for login... (will wait up to 3 min)");
try {
  await page.waitForFunction(() => !window.location.href.includes("login"), { timeout: 180000, polling: 2000 });
} catch(e) {
  console.log("Login wait timeout:", e.message);
}
console.log("After login URL:", page.url());
await page.waitForTimeout(5000);
// Now dump DOM
const result = await page.evaluate(() => {
  // Find all inputs and their context
  const all = document.querySelectorAll("input:not([type=hidden])");
  return Array.from(all).map((inp, i) => {
    const r = inp.getBoundingClientRect();
    let p = inp.parentElement;
    let parentText = "";
    for (let d = 0; d < 6 && p; d++) {
      const t = (p.textContent || "").trim();
      parentText = t.substring(0, 200);
      if (t.includes("价") || t.includes("库存") || t.includes("口") || t.includes("元")) break;
      p = p.parentElement;
    }
    return {
      idx: i,
      placeholder: inp.placeholder,
      type: inp.type,
      width: Math.round(r.width),
      height: Math.round(r.height),
      top: Math.round(r.top),
      left: Math.round(r.left),
      parentText: parentText.substring(0, 150),
    };
  });
});
console.log("\\n=== RELEVANT INPUTS (w>30 & h>10) ===");
result.forEach(inp => {
  if (inp.width > 30 && inp.height > 10) console.log(JSON.stringify(inp));
});
await page.screenshot({ path: "C:\\tmp\\publish_debug.png", fullPage: false });
console.log("Screenshot saved");
