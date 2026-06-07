/**
 * 1688 sourcing search service
 */
import { chromium } from 'playwright';

// Product catalogs by category
const MOCK_CATALOG = {
  "tea": [
    {
      "title": "金丝皇菊 大朵黄山贡菊 50g罐装 花草茶",
      "price": 8.5,
      "image": "",
      "url": "",
      "shop": "黄山徽味茶业",
      "salesInfo": "已售5000+件"
    },
    {
      "title": "玫瑰花茶 平阴玫瑰干花 500g 泡水花茶",
      "price": 15.8,
      "image": "",
      "url": "",
      "shop": "平阴玫瑰基地",
      "salesInfo": "已售2万+件"
    },
    {
      "title": "桂花干 广西金桂 100g 花茶原料 食品级",
      "price": 12.0,
      "image": "",
      "url": "",
      "shop": "桂林桂花加工厂",
      "salesInfo": "已售8000+件"
    },
    {
      "title": "茉莉花茶 横县茉莉花 250g 浓香型",
      "price": 18.5,
      "image": "",
      "url": "",
      "shop": "横县茉莉花合作社",
      "salesInfo": "已售1万+件"
    },
    {
      "title": "洛神花 玫瑰茄干 500g 花果茶原料",
      "price": 9.9,
      "image": "",
      "url": "",
      "shop": "云南花茶供应链",
      "salesInfo": "已售3000+件"
    },
    {
      "title": "组合型花茶 混合花草茶 三角包 100包",
      "price": 22.0,
      "image": "",
      "url": "",
      "shop": "亳州花草茶基地",
      "salesInfo": "已售1.5万+件"
    },
    {
      "title": "柠檬片干 冻干柠檬 泡水水果茶 500g",
      "price": 13.5,
      "image": "",
      "url": "",
      "shop": "安岳柠檬加工厂",
      "salesInfo": "已售3万+件"
    },
    {
      "title": "陈皮丝 新会陈皮 五年陈 花茶伴侣 100g",
      "price": 25.0,
      "image": "",
      "url": "",
      "shop": "新会陈皮老店",
      "salesInfo": "已售6000+件"
    },
    {
      "title": "薄荷叶干 清凉薄荷茶 200g 去火茶",
      "price": 7.8,
      "image": "",
      "url": "",
      "shop": "江苏薄荷种植基地",
      "salesInfo": "已售4000+件"
    },
    {
      "title": "决明子 熟决明子 500g 花茶原料",
      "price": 11.0,
      "image": "",
      "url": "",
      "shop": "安徽中药材批发",
      "salesInfo": "已售1万+件"
    },
    {
      "title": "胖大海 大颗胖大海 100g 润喉茶",
      "price": 16.0,
      "image": "",
      "url": "",
      "shop": "云南药材商行",
      "salesInfo": "已售7000+件"
    },
    {
      "title": "菊花茶 杭白菊 胎菊王 250g 明目茶",
      "price": 10.5,
      "image": "",
      "url": "",
      "shop": "桐乡杭白菊基地",
      "salesInfo": "已售2万+件"
    }
  ],
  "herb": [
    {
      "title": "宁夏特级枸杞 中宁枸杞 500g 免洗",
      "price": 18.5,
      "image": "",
      "url": "",
      "shop": "中宁枸杞合作社",
      "salesInfo": "已售5万+件"
    },
    {
      "title": "黄芪切片 甘肃黄芪 250g 正品北芪",
      "price": 22.0,
      "image": "",
      "url": "",
      "shop": "甘肃陇西药材行",
      "salesInfo": "已售2万+件"
    },
    {
      "title": "三七粉 云南文山三七 100g 超细粉",
      "price": 35.0,
      "image": "",
      "url": "",
      "shop": "文山三七基地",
      "salesInfo": "已售1万+件"
    },
    {
      "title": "灵芝孢子粉 长白山破壁灵芝孢子粉 100g",
      "price": 55.0,
      "image": "",
      "url": "",
      "shop": "长白山特产商行",
      "salesInfo": "已售5000+件"
    },
    {
      "title": "铁皮石斛 霍山石斛枫斗 50g 礼盒装",
      "price": 45.0,
      "image": "",
      "url": "",
      "shop": "霍山石斛种植基地",
      "salesInfo": "已售3000+件"
    },
    {
      "title": "冬虫夏草 西藏那曲虫草 10g 精选",
      "price": 120.0,
      "image": "",
      "url": "",
      "shop": "那曲虫草专卖店",
      "salesInfo": "已售500+件"
    },
    {
      "title": "当归 甘肃岷县当归 500g 全归片",
      "price": 28.0,
      "image": "",
      "url": "",
      "shop": "岷县当归合作社",
      "salesInfo": "已售1万+件"
    },
    {
      "title": "党参 甘肃纹党 250g 无硫",
      "price": 32.0,
      "image": "",
      "url": "",
      "shop": "陇西中药材市场",
      "salesInfo": "已售8000+件"
    },
    {
      "title": "人参 长白山生晒参 50g 整支",
      "price": 68.0,
      "image": "",
      "url": "",
      "shop": "长白山参茸行",
      "salesInfo": "已售2000+件"
    },
    {
      "title": "红枣 新疆若羌红枣 500g 特级",
      "price": 15.0,
      "image": "",
      "url": "",
      "shop": "若羌红枣基地",
      "salesInfo": "已售10万+件"
    },
    {
      "title": "银耳 古田银耳 250g 糯耳",
      "price": 20.0,
      "image": "",
      "url": "",
      "shop": "古田银耳加工厂",
      "salesInfo": "已售3万+件"
    },
    {
      "title": "燕窝 印尼溯源燕窝 50g 干挑大盏",
      "price": 280.0,
      "image": "",
      "url": "",
      "shop": "印尼燕窝进口商",
      "salesInfo": "已售1000+件"
    }
  ],
  "general": [
    {
      "title": "手机支架 桌面懒人支架 通用款",
      "price": 5.9,
      "image": "",
      "url": "",
      "shop": "深圳3C配件厂",
      "salesInfo": "已售10万+件"
    },
    {
      "title": "无线蓝牙耳机 降噪运动耳机",
      "price": 29.9,
      "image": "",
      "url": "",
      "shop": "东莞电子科技",
      "salesInfo": "已售5万+件"
    },
    {
      "title": "保温杯 不锈钢真空杯 500ml",
      "price": 15.0,
      "image": "",
      "url": "",
      "shop": "永康杯业制造厂",
      "salesInfo": "已售8万+件"
    },
    {
      "title": "USB充电小风扇 便携桌面风扇",
      "price": 8.8,
      "image": "",
      "url": "",
      "shop": "汕头小家电工厂",
      "salesInfo": "已售3万+件"
    },
    {
      "title": "收纳盒 塑料整理箱 三件套",
      "price": 12.5,
      "image": "",
      "url": "",
      "shop": "台州塑料制品厂",
      "salesInfo": "已售6万+件"
    },
    {
      "title": "瑜伽垫 加厚防滑 NBR材质",
      "price": 18.0,
      "image": "",
      "url": "",
      "shop": "义乌体育用品",
      "salesInfo": "已售4万+件"
    },
    {
      "title": "LED台灯 护眼学习灯 三档调光",
      "price": 25.0,
      "image": "",
      "url": "",
      "shop": "中山灯饰工厂",
      "salesInfo": "已售2万+件"
    },
    {
      "title": "拖鞋 夏季凉拖鞋 情侣款",
      "price": 6.5,
      "image": "",
      "url": "",
      "shop": "晋江鞋业工厂",
      "salesInfo": "已售20万+件"
    }
  ]
};


function getMockProducts(keyword, limit = 20) {
  console.log('[1688Mock] keyword="' + keyword + '"');
  const kw = keyword.toLowerCase();
  let catalog;

  const teaWords = ["茶", "花", "菊", "玫瑰", "茉莉", "桂花", "柠檬", "陈皮", "荷叶", "薄荷", "决明", "胖大海", "洛神", "草", "泡", "饮"];
  const herbWords = ["枸杞", "黄芪", "三七", "灵芝", "石斛", "虫草", "当归", "党参", "人参", "红枣", "银耳", "燕窝", "阿胶", "鹿茸", "参", "药", "补", "养生", "保健"];

  const teaMatch = teaWords.some(w => kw.includes(w));
  const herbMatch = herbWords.some(w => kw.includes(w));

  if (teaMatch && !herbMatch) catalog = MOCK_CATALOG.tea;
  else if (herbMatch && !teaMatch) catalog = MOCK_CATALOG.herb;
  else if (teaMatch && herbMatch) catalog = [...MOCK_CATALOG.tea, ...MOCK_CATALOG.herb];
  else catalog = MOCK_CATALOG.general;

  let products = catalog.filter(p =>
    p.title.toLowerCase().includes(kw) ||
    kw.split("").some(c => p.title.includes(c))
  );

  if (products.length === 0) products = catalog;

  return products.slice(0, limit).map((p, i) => ({
    ...p,
    id: "mock_" + keyword + "_" + i,
    platform: "1688",
    source: "mock",
  }));
}

export async function search1688(keyword, options = {}) {
  const { limit = 20 } = options;
  console.log('[1688Search] keyword="' + keyword + '"');

  let realProducts = [];
  try {
    realProducts = await search1688Real(keyword, limit);
  } catch (e) {
    console.log('[1688Search] Real search failed: ' + e.message);
  }

  if (realProducts.length > 0) {
    return { products: realProducts.slice(0, limit), totalResults: realProducts.length, keyword };
  }

  const mockProducts = getMockProducts(keyword, limit);
  return { products: mockProducts, totalResults: mockProducts.length, keyword, source: "mock" };
}

async function search1688Real(keyword, limit = 20) {
  const params = new URLSearchParams({ keywords: keyword });
  params.append("sortType", "va_rmdarkgmv30");
  const searchUrl = "https://s.1688.com/selloffer/offer_search.htm?" + params.toString();

  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: "zh-CN",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    await page.route("**/*.{png,jpg,gif,svg,woff,woff2,ttf,eot,mp4,webm}", (route) => route.abort());
    try { await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 8000 }); } catch (e) {}
    await page.waitForTimeout(2000);
    const currentUrl = page.url();
    if (currentUrl.includes("login") || currentUrl.includes("punish") || currentUrl.includes("verify")) {
      await context.close();
      return [];
    }
    const products = await page.evaluate(({ limit }) => {
      const results = []; const seen = new Set();
      const selectors = [".offer-list .offer-item", ".offer-list-item", '[class*="offer-item"]', ".sm-offer-item"];
      let items = [];
      for (const sel of selectors) { items = document.querySelectorAll(sel); if (items.length > 0) break; }
      for (const item of items) {
        if (results.length >= limit) break;
        try {
          let image = ""; const img = item.querySelector("img");
          if (img) { image = img.src || img.getAttribute("data-src") || ""; if (image.startsWith("//")) image = "https:" + image; }
          let title = ""; const titleEl = item.querySelector('[class*="title"]') || item.querySelector('[class*="name"]') || item.querySelector("h3") || item.querySelector("a");
          if (titleEl) title = (titleEl.textContent || "").trim().replace(/\s+/g, " ");
          let price = ""; const priceEl = item.querySelector('[class*="price"]') || item.querySelector('[class*="money"]');
          if (priceEl) { const m = (priceEl.textContent || "").match(/([\d,.]+)/); if (m) price = parseFloat(m[1].replace(/,/g, "")); }
          let url = ""; const linkEl = item.querySelector("a[href*='offer']") || item.querySelector("a");
          if (linkEl) { url = linkEl.href || ""; if (url.startsWith("//")) url = "https:" + url; }
          let shop = ""; const shopEl = item.querySelector('[class*="company"]') || item.querySelector('[class*="shop"]') || item.querySelector('[class*="store"]');
          if (shopEl) shop = (shopEl.textContent || "").trim();
          let salesInfo = ""; const salesEl = item.querySelector('[class*="sale"]') || item.querySelector('[class*="trade"]');
          if (salesEl) salesInfo = (salesEl.textContent || "").trim();
          const key = title.substring(0, 30).toLowerCase(); if (!key || seen.has(key)) continue; seen.add(key);
          if (title && price) results.push({ title, price: typeof price === "number" ? price : parseFloat(price) || 0, image, url, shop, salesInfo, platform: "1688" });
        } catch (e) {}
      }
      return results;
    }, { limit });
    await context.close();
    return products;
  } catch (err) {
    if (browser) { try { await browser.close(); } catch {} }
    return [];
  }
}
