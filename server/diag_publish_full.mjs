/**
 * Diagnose the Taobao AI publish page DOM to find price/stock input selectors.
 * Kills existing Playwright-launched Edge, cleans lock, launches fresh.
 */
import { chromium } from "playwright";
import { join } from "path";
import { rmSync } from "fs";
import { execSync } from "child_process";

const PROFILE_DIR = "D:\\software\\AI\\ClaudeCode\\taobao-dropship-tool\\server\\data\\taobao-profile";

console.log("Killing existing Edge processes from taobao-profile...");
try { execSync('taskkill /F /IM msedge.exe', { stdio: 'ignore' }); } catch(e) { console.log("Kill done (or no Edge running)"); }
await new Promise(r => setTimeout(r, 2000));

for (const lock of ["SingletonLock","SingletonSocket","SingletonCookie","lockfile"]) {
  try { rmSync(join(PROFILE_DIR, lock), { recursive: true, force: true }); } catch {}
}

console.log("Launching Edge with persistent context...");
const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false, channel: "msedge",
  viewport: { width: 1280, height: 900 },
  args: ["--disable-blink-features=AutomationControlled", "--start-maximized"],
  timeout: 60000,
});

const page = await context.newPage();
page.setDefaultTimeout(300000);

console.log("Navigating to publish page...");
await page.goto("https://item.upload.taobao.com/sell/v2/publish.htm?catId=125242010", {
  waitUntil: "domcontentloaded", timeout: 60000
}).catch(e => console.log("Nav error:", e.message));
console.log("URL:", page.url());

if (page.url().includes("login")) {
  console.log("LOGIN REQUIRED - Scan QR in Edge. 5 min timeout.");
  try {
    await page.waitForFunction(() => !window.location.href.includes("login"), { timeout: 300000, polling: 2000 });
    await page.waitForTimeout(5000);
    console.log("Login detected! URL:", page.url());
  } catch(e) {
    console.log("Login timeout:", e.message.slice(0,200));
    await context.close(); process.exit(1);
  }
}

await page.waitForTimeout(5000);

// DUMP ALL INPUTS
const allInputs = await page.evaluate(() => {
  const inputs = document.querySelectorAll('input:not([type="hidden"])');
  return Array.from(inputs).map((inp, i) => {
    const r = inp.getBoundingClientRect();
    if (r.width < 10 || r.height < 5) return null;
    
    let labelText = "";
    let el = inp;
    for (let d = 0; d < 10 && el; d++) {
      const t = (el.textContent || "").trim();
      if (t.length > 0) { labelText = t.substring(0, 200); break; }
      el = el.parentElement;
    }
    
    let prevLabel = "";
    const prev = inp.previousElementSibling;
    if (prev) prevLabel = (prev.textContent || "").trim().substring(0, 60);
    
    return {
      idx: i, tag: inp.tagName, type: inp.type,
      placeholder: (inp.placeholder || "").substring(0, 80),
      inputmode: inp.inputMode || "",
      id: inp.id || "", name: inp.name || "",
      value: (inp.value || "").substring(0, 30),
      top: Math.round(r.top), left: Math.round(r.left),
      w: Math.round(r.width), h: Math.round(r.height),
      prevLabel: prevLabel.substring(0, 80),
      labelText: labelText.substring(0, 150),
    };
  }).filter(Boolean);
});

console.log("\n=== ALL INPUTS (sorted by top) ===");
allInputs.sort((a,b) => a.top - b.top);
allInputs.forEach(inp => console.log(JSON.stringify(inp)));

// Search price/stock text nodes
console.log("\n=== Price/Stock related form groups ===");
const formGroups = await page.evaluate(() => {
  const results = [];
  const keywords = ["一口价", "总库存", "库存", "价格", "售价", "数量", "元"];
  for (const kw of keywords) {
    const walker = document.createTreeWalker(document.body, 4, null, false);
    let node;
    while (node = walker.nextNode()) {
      const t = node.textContent.trim();
      if (!t || t.length > 60 || !t.includes(kw)) continue;
      const parent = node.parentElement;
      if (!parent) continue;
      
      // Find the containing form group (up to 5 levels)
      let section = parent;
      for (let d = 0; d < 5 && section; d++) {
        if ((section.className || "").match(/form|item|group|row|field|section/i)) break;
        section = section.parentElement;
      }
      if (!section) continue;
      
      // Find the nearest input
      const inputs = section.querySelectorAll('input:not([type="hidden"]):not([type="radio"])');
      const inpInfo = inputs.length > 0 ? Array.from(inputs).map(inp => ({
        placeholder: inp.placeholder,
        type: inp.type,
        inputmode: inp.inputMode,
        top: Math.round(inp.getBoundingClientRect().top),
        w: Math.round(inp.getBoundingClientRect().width),
      })) : [];
      
      results.push({
        keyword: kw,
        text: t.substring(0, 30),
        sectionClass: (section.className || "").substring(0, 80),
        sectionTag: section.tagName,
        inputsFound: inpInfo,
        sectionHTML: section.outerHTML.replace(/>\s+</g, "><").replace(/\s+/g, " ").substring(0, 600),
      });
      break;
    }
  }
  return results;
});
formGroups.forEach(x => console.log(JSON.stringify(x, null, 2)));

await page.screenshot({ path: "C:\\tmp\\publish_dom.png", fullPage: true });
console.log("\nScreenshot saved to C:\\tmp\\publish_dom.png");
console.log("Browser stays open. Press Ctrl+C to close.");
await new Promise(() => {});
