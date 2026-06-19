/**
 * 1688 sourcing search service
 * - Real Playwright scraping with anti-detection
 * - Mock fallback with rich product data and images
 * - Search result caching (10 min TTL)
 */
import { chromium } from 'playwright';

// ============================================================
// Search cache (keyword → { products, expires })
// ============================================================
const _cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function getCached(keyword) {
  const entry = _cache.get(keyword);
  if (entry && Date.now() < entry.expires) return entry.products;
  _cache.delete(keyword);
  return null;
}

function setCache(keyword, products) {
  _cache.set(keyword, { products, expires: Date.now() + CACHE_TTL });
}

// ============================================================
// Rich mock product catalog with placeholder images
// ============================================================
const MOCK_CATALOG = {
  tea: [
    { title: "金丝皇菊 大朵黄山贡菊 50g罐装 花草茶", price: 8.5, image: "https://picsum.photos/seed/tea1/400/400", shop: "黄山徽味茶业", salesInfo: "已售5000+件" },
    { title: "玫瑰花茶 平阴玫瑰干花 500g 泡水花茶", price: 15.8, image: "https://picsum.photos/seed/tea2/400/400", shop: "平阴玫瑰基地", salesInfo: "已售2万+件" },
    { title: "桂花干 广西金桂 100g 花茶原料 食品级", price: 12.0, image: "https://picsum.photos/seed/tea3/400/400", shop: "桂林桂花加工厂", salesInfo: "已售8000+件" },
    { title: "茉莉花茶 横县茉莉花 250g 浓香型", price: 18.5, image: "https://picsum.photos/seed/tea4/400/400", shop: "横县茉莉花合作社", salesInfo: "已售1万+件" },
    { title: "洛神花 玫瑰茄干 500g 花果茶原料", price: 9.9, image: "https://picsum.photos/seed/tea5/400/400", shop: "云南花茶供应链", salesInfo: "已售3000+件" },
    { title: "组合型花茶 混合花草茶 三角包 100包", price: 22.0, image: "https://picsum.photos/seed/tea6/400/400", shop: "亳州花草茶基地", salesInfo: "已售1.5万+件" },
    { title: "柠檬片干 冻干柠檬 泡水水果茶 500g", price: 13.5, image: "https://picsum.photos/seed/tea7/400/400", shop: "安岳柠檬加工厂", salesInfo: "已售3万+件" },
    { title: "陈皮丝 新会陈皮 五年陈 花茶伴侣 100g", price: 25.0, image: "https://picsum.photos/seed/tea8/400/400", shop: "新会陈皮老店", salesInfo: "已售6000+件" },
    { title: "薄荷叶干 清凉薄荷茶 200g 去火茶", price: 7.8, image: "https://picsum.photos/seed/tea9/400/400", shop: "江苏薄荷种植基地", salesInfo: "已售4000+件" },
    { title: "决明子 熟决明子 500g 花茶原料", price: 11.0, image: "https://picsum.photos/seed/tea10/400/400", shop: "安徽中药材批发", salesInfo: "已售1万+件" },
    { title: "胖大海 大颗胖大海 100g 润喉茶", price: 16.0, image: "https://picsum.photos/seed/tea11/400/400", shop: "云南药材商行", salesInfo: "已售7000+件" },
    { title: "菊花茶 杭白菊 胎菊王 250g 明目茶", price: 10.5, image: "https://picsum.photos/seed/tea12/400/400", shop: "桐乡杭白菊基地", salesInfo: "已售2万+件" },
    { title: "红枣枸杞茶 养生茶包 独立包装 30包", price: 14.0, image: "https://picsum.photos/seed/tea13/400/400", shop: "安徽养生茶厂", salesInfo: "已售9000+件" },
    { title: "山楂干 山楂片 泡水喝 500g 无核", price: 9.5, image: "https://picsum.photos/seed/tea14/400/400", shop: "山东山楂基地", salesInfo: "已售1.2万+件" },
    { title: "荷叶茶 干荷叶 200g 减肥茶原料", price: 8.0, image: "https://picsum.photos/seed/tea15/400/400", shop: "湖北荷叶合作社", salesInfo: "已售5000+件" },
    { title: "苦荞茶 凉山苦荞 全胚芽 500g", price: 12.5, image: "https://picsum.photos/seed/tea16/400/400", shop: "凉山苦荞种植基地", salesInfo: "已售2万+件" },
    { title: "牛蒡茶 牛蒡片 焙烤型 250g", price: 15.0, image: "https://picsum.photos/seed/tea17/400/400", shop: "山东牛蒡加工厂", salesInfo: "已售3000+件" },
    { title: "桑叶茶 霜桑叶 嫩芽茶 100g", price: 18.0, image: "https://picsum.photos/seed/tea18/400/400", shop: "浙江桑叶基地", salesInfo: "已售2000+件" },
    { title: "大麦茶 焙炒大麦 日式玄米茶 500g", price: 8.8, image: "https://picsum.photos/seed/tea19/400/400", shop: "东北大麦加工厂", salesInfo: "已售4万+件" },
    { title: "金银花茶 河南封丘金银花 100g", price: 35.0, image: "https://picsum.photos/seed/tea20/400/400", shop: "封丘金银花合作社", salesInfo: "已售6000+件" },
  ],
  herb: [
    { title: "宁夏特级枸杞 中宁枸杞 500g 免洗", price: 18.5, image: "https://picsum.photos/seed/herb1/400/400", shop: "中宁枸杞合作社", salesInfo: "已售5万+件" },
    { title: "黄芪切片 甘肃黄芪 250g 正品北芪", price: 22.0, image: "https://picsum.photos/seed/herb2/400/400", shop: "甘肃陇西药材行", salesInfo: "已售2万+件" },
    { title: "三七粉 云南文山三七 100g 超细粉", price: 35.0, image: "https://picsum.photos/seed/herb3/400/400", shop: "文山三七基地", salesInfo: "已售1万+件" },
    { title: "灵芝孢子粉 长白山破壁灵芝孢子粉 100g", price: 55.0, image: "https://picsum.photos/seed/herb4/400/400", shop: "长白山特产商行", salesInfo: "已售5000+件" },
    { title: "铁皮石斛 霍山石斛枫斗 50g 礼盒装", price: 45.0, image: "https://picsum.photos/seed/herb5/400/400", shop: "霍山石斛种植基地", salesInfo: "已售3000+件" },
    { title: "冬虫夏草 西藏那曲虫草 10g 精选", price: 120.0, image: "https://picsum.photos/seed/herb6/400/400", shop: "那曲虫草专卖店", salesInfo: "已售500+件" },
    { title: "当归 甘肃岷县当归 500g 全归片", price: 28.0, image: "https://picsum.photos/seed/herb7/400/400", shop: "岷县当归合作社", salesInfo: "已售1万+件" },
    { title: "党参 甘肃纹党 250g 无硫", price: 32.0, image: "https://picsum.photos/seed/herb8/400/400", shop: "陇西中药材市场", salesInfo: "已售8000+件" },
    { title: "人参 长白山生晒参 50g 整支", price: 68.0, image: "https://picsum.photos/seed/herb9/400/400", shop: "长白山参茸行", salesInfo: "已售2000+件" },
    { title: "红枣 新疆若羌红枣 500g 特级", price: 15.0, image: "https://picsum.photos/seed/herb10/400/400", shop: "若羌红枣基地", salesInfo: "已售10万+件" },
    { title: "银耳 古田银耳 250g 糯耳", price: 20.0, image: "https://picsum.photos/seed/herb11/400/400", shop: "古田银耳加工厂", salesInfo: "已售3万+件" },
    { title: "燕窝 印尼溯源燕窝 50g 干挑大盏", price: 280.0, image: "https://picsum.photos/seed/herb12/400/400", shop: "印尼燕窝进口商", salesInfo: "已售1000+件" },
    { title: "阿胶 山东东阿阿胶 250g 正品", price: 150.0, image: "https://picsum.photos/seed/herb13/400/400", shop: "东阿阿胶旗舰店", salesInfo: "已售8000+件" },
    { title: "鹿茸片 梅花鹿茸 50g 礼盒装", price: 180.0, image: "https://picsum.photos/seed/herb14/400/400", shop: "东北鹿茸商行", salesInfo: "已售1500+件" },
    { title: "西洋参片 花旗参 100g 切片", price: 58.0, image: "https://picsum.photos/seed/herb15/400/400", shop: "吉林参茸批发", salesInfo: "已售6000+件" },
    { title: "川贝母 四川松贝 50g 正品", price: 95.0, image: "https://picsum.photos/seed/herb16/400/400", shop: "四川中药材行", salesInfo: "已售2000+件" },
    { title: "天麻 云南昭通天麻 100g 野生", price: 65.0, image: "https://picsum.photos/seed/herb17/400/400", shop: "昭通天麻合作社", salesInfo: "已售3000+件" },
    { title: "藏红花 伊朗藏红花 5g 特级", price: 88.0, image: "https://picsum.photos/seed/herb18/400/400", shop: "西域药材进口", salesInfo: "已售4000+件" },
    { title: "田七粉 文山田七 超细粉 250g", price: 52.0, image: "https://picsum.photos/seed/herb19/400/400", shop: "文山三七直销", salesInfo: "已售5000+件" },
    { title: "酸枣仁 酸枣仁粉 200g 安神", price: 28.0, image: "https://picsum.photos/seed/herb20/400/400", shop: "河北酸枣加工厂", salesInfo: "已售1万+件" },
  ],
  general: [
    { title: "手机支架 桌面懒人支架 通用款", price: 5.9, image: "https://picsum.photos/seed/gen1/400/400", shop: "深圳3C配件厂", salesInfo: "已售10万+件" },
    { title: "无线蓝牙耳机 降噪运动耳机", price: 29.9, image: "https://picsum.photos/seed/gen2/400/400", shop: "东莞电子科技", salesInfo: "已售5万+件" },
    { title: "保温杯 不锈钢真空杯 500ml", price: 15.0, image: "https://picsum.photos/seed/gen3/400/400", shop: "永康杯业制造厂", salesInfo: "已售8万+件" },
    { title: "USB充电小风扇 便携桌面风扇", price: 8.8, image: "https://picsum.photos/seed/gen4/400/400", shop: "汕头小家电工厂", salesInfo: "已售3万+件" },
    { title: "收纳盒 塑料整理箱 三件套", price: 12.5, image: "https://picsum.photos/seed/gen5/400/400", shop: "台州塑料制品厂", salesInfo: "已售6万+件" },
    { title: "瑜伽垫 加厚防滑 NBR材质", price: 18.0, image: "https://picsum.photos/seed/gen6/400/400", shop: "义乌体育用品", salesInfo: "已售4万+件" },
    { title: "LED台灯 护眼学习灯 三档调光", price: 25.0, image: "https://picsum.photos/seed/gen7/400/400", shop: "中山灯饰工厂", salesInfo: "已售2万+件" },
    { title: "拖鞋 夏季凉拖鞋 情侣款", price: 6.5, image: "https://picsum.photos/seed/gen8/400/400", shop: "晋江鞋业工厂", salesInfo: "已售20万+件" },
    { title: "遮阳帽 防紫外线 大帽檐 女款", price: 9.9, image: "https://picsum.photos/seed/gen9/400/400", shop: "义乌帽子厂", salesInfo: "已售5万+件" },
    { title: "玻璃水杯 高硼硅玻璃 带盖带勺", price: 7.5, image: "https://picsum.photos/seed/gen10/400/400", shop: "河间玻璃制品厂", salesInfo: "已售8万+件" },
    { title: "洗碗手套 加厚乳胶 防滑耐磨", price: 3.5, image: "https://picsum.photos/seed/gen11/400/400", shop: "义乌日用品厂", salesInfo: "已售15万+件" },
    { title: "垃圾袋 加厚手提式 100只装", price: 5.8, image: "https://picsum.photos/seed/gen12/400/400", shop: "金华塑料制品厂", salesInfo: "已售50万+件" },
    { title: "纸巾盒 创意简约 桌面收纳", price: 8.0, image: "https://picsum.photos/seed/gen13/400/400", shop: "义乌家居用品", salesInfo: "已售3万+件" },
    { title: "雨伞 折叠晴雨伞 防风加固", price: 12.0, image: "https://picsum.photos/seed/gen14/400/400", shop: "天堂伞业代工", salesInfo: "已售10万+件" },
    { title: "钥匙扣 创意合金 多款式可选", price: 2.5, image: "https://picsum.photos/seed/gen15/400/400", shop: "温州钥匙扣厂", salesInfo: "已售20万+件" },
    { title: "鼠标垫 超大号 加厚防滑", price: 6.0, image: "https://picsum.photos/seed/gen16/400/400", shop: "深圳鼠标垫厂", salesInfo: "已售12万+件" },
    { title: "数据线 Type-C 快充 1米", price: 3.8, image: "https://picsum.photos/seed/gen17/400/400", shop: "深圳数据线工厂", salesInfo: "已售30万+件" },
    { title: "充电宝 10000mAh 超薄便携", price: 35.0, image: "https://picsum.photos/seed/gen18/400/400", shop: "深圳充电宝工厂", salesInfo: "已售8万+件" },
    { title: "指甲刀套装 不锈钢 12件套", price: 9.9, image: "https://picsum.photos/seed/gen19/400/400", shop: "阳江刀具厂", salesInfo: "已售6万+件" },
    { title: "厨房收纳架 不锈钢多功能 置物架", price: 22.0, image: "https://picsum.photos/seed/gen20/400/400", shop: "揭阳不锈钢厂", salesInfo: "已售4万+件" },
  ],
  food: [
    { title: "新疆葡萄干 无核白 500g 特级", price: 16.0, image: "https://picsum.photos/seed/food1/400/400", shop: "新疆干果批发", salesInfo: "已售8万+件" },
    { title: "核桃 云南薄皮核桃 500g 新货", price: 19.9, image: "https://picsum.photos/seed/food2/400/400", shop: "云南核桃合作社", salesInfo: "已售5万+件" },
    { title: "桂圆干 莆田桂圆 500g 特级", price: 22.0, image: "https://picsum.photos/seed/food3/400/400", shop: "莆田桂圆加工厂", salesInfo: "已售3万+件" },
    { title: "蜂蜜 百花蜜 500g 纯天然", price: 28.0, image: "https://picsum.photos/seed/food4/400/400", shop: "秦岭蜂蜜合作社", salesInfo: "已售2万+件" },
    { title: "黑芝麻丸 九蒸九晒 108粒装", price: 32.0, image: "https://picsum.photos/seed/food5/400/400", shop: "安徽养生食品厂", salesInfo: "已售1万+件" },
    { title: "阿胶糕 山东东阿 即食型 500g", price: 48.0, image: "https://picsum.photos/seed/food6/400/400", shop: "东阿阿胶食品", salesInfo: "已售1.5万+件" },
    { title: "红豆薏米粉 代餐粉 500g 冲泡", price: 18.0, image: "https://picsum.photos/seed/food7/400/400", shop: "安徽五谷杂粮厂", salesInfo: "已售4万+件" },
    { title: "山药粉 焦作铁棍山药粉 500g", price: 25.0, image: "https://picsum.photos/seed/food8/400/400", shop: "焦作山药合作社", salesInfo: "已售2万+件" },
    { title: "杏仁 甜杏仁 500g 无壳 原味", price: 24.0, image: "https://picsum.photos/seed/food9/400/400", shop: "新疆杏仁加工厂", salesInfo: "已售1万+件" },
    { title: "松子 东北红松子 250g 开口", price: 38.0, image: "https://picsum.photos/seed/food10/400/400", shop: "东北松子批发", salesInfo: "已售8000+件" },
    { title: "腰果 越南腰果 紫皮 500g", price: 42.0, image: "https://picsum.photos/seed/food11/400/400", shop: "越南坚果进口商", salesInfo: "已售6000+件" },
    { title: "开心果 美国开心果 250g 原味", price: 35.0, image: "https://picsum.photos/seed/food12/400/400", shop: "进口坚果批发", salesInfo: "已售5000+件" },
    { title: "芒果干 泰国芒果干 200g 软糖", price: 12.0, image: "https://picsum.photos/seed/food13/400/400", shop: "泰国零食进口", salesInfo: "已售3万+件" },
    { title: "蔓越莓干 进口蔓越莓 250g 烘焙", price: 18.0, image: "https://picsum.photos/seed/food14/400/400", shop: "进口干果批发", salesInfo: "已售1万+件" },
    { title: "红枣夹核桃 新疆特产 500g", price: 26.0, image: "https://picsum.photos/seed/food15/400/400", shop: "新疆干果直营", salesInfo: "已售2万+件" },
    { title: "即食燕麦片 水果麦片 500g 早餐", price: 14.0, image: "https://picsum.photos/seed/food16/400/400", shop: "广西麦片工厂", salesInfo: "已售5万+件" },
    { title: "藕粉 西湖藕粉 纯藕粉 300g", price: 20.0, image: "https://picsum.photos/seed/food17/400/400", shop: "杭州藕粉厂", salesInfo: "已售1万+件" },
    { title: "芝麻糊 南方黑芝麻糊 600g 袋装", price: 16.0, image: "https://picsum.photos/seed/food18/400/400", shop: "广西食品厂", salesInfo: "已售3万+件" },
    { title: "海苔 紫菜 海苔片 100g 原味", price: 9.9, image: "https://picsum.photos/seed/food19/400/400", shop: "福建海苔加工厂", salesInfo: "已售4万+件" },
    { title: "辣条 大面筋 卫龙同款 500g", price: 12.0, image: "https://picsum.photos/seed/food20/400/400", shop: "湖南辣条厂", salesInfo: "已售10万+件" },
  ],
};

// ============================================================
// Keyword → catalog matching
// ============================================================
function matchCatalog(keyword) {
  // Decode URL-encoded keyword
  let kw = keyword.toLowerCase();
  try { kw = decodeURIComponent(kw).toLowerCase(); } catch {}
  kw = kw.replace(/\?/g, '').replace(/&/g, '');

  const teaWords = ["茶", "花", "菊", "玫瑰", "茉莉", "桂花", "柠檬", "陈皮", "荷叶", "薄荷", "决明", "胖大海", "洛神", "泡", "饮", "荞", "蒡", "桑叶", "大麦", "金银花"];
  const herbWords = ["枸杞", "黄芪", "三七", "灵芝", "石斛", "虫草", "当归", "党参", "人参", "红枣", "银耳", "燕窝", "阿胶", "鹿茸", "参", "药", "补", "养生", "保健", "田七", "天麻", "贝母", "藏红花", "酸枣"];
  const foodWords = ["葡萄干", "核桃", "桂圆", "蜂蜜", "芝麻", "杏仁", "松子", "腰果", "开心果", "芒果", "蔓越莓", "燕麦", "藕粉", "海苔", "辣条", "零食", "坚果", "干果", "蜜饯", "糖果", "饼干", "糕点"];

  const teaMatch = teaWords.some(w => kw.includes(w));
  const herbMatch = herbWords.some(w => kw.includes(w));
  const foodMatch = foodWords.some(w => kw.includes(w));

  if (foodMatch && !teaMatch && !herbMatch) return MOCK_CATALOG.food;
  if (teaMatch && herbMatch) return [...MOCK_CATALOG.tea, ...MOCK_CATALOG.herb];
  if (teaMatch) return MOCK_CATALOG.tea;
  if (herbMatch) return MOCK_CATALOG.herb;
  return MOCK_CATALOG.general;
}

function getMockProducts(keyword, limit = 20) {
  console.log('[1688Mock] keyword="' + keyword + '"');
  const catalog = matchCatalog(keyword);
  const kw = keyword.toLowerCase();

  // Filter by keyword relevance
  let products = catalog.filter(p =>
    p.title.toLowerCase().includes(kw) ||
    kw.split("").some(c => p.title.includes(c))
  );

  // If no match, return full catalog
  if (products.length === 0) products = catalog;

  return products.slice(0, limit).map((p, i) => ({
    ...p,
    id: "mock_" + keyword + "_" + i,
    platform: "1688",
    source: "mock",
  }));
}

// ============================================================
// Real 1688 search via Playwright
// ============================================================
async function search1688Real(keyword, limit = 20) {
  const params = new URLSearchParams({ keywords: keyword });
  params.append("sortType", "va_rmdarkgmv30");
  const searchUrl = "https://s.1688.com/selloffer/offer_search.htm?" + params.toString();

  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: "zh-CN",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();

    // Block heavy resources for speed
    await page.route("**/*.{png,jpg,gif,svg,woff,woff2,ttf,eot,mp4,webp}", (route) => route.abort());

    try {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 10000 });
    } catch (e) {
      console.log('[1688Real] goto error (continuing):', e.message);
    }

    await page.waitForTimeout(2500);

    const currentUrl = page.url();
    if (currentUrl.includes("login") || currentUrl.includes("punish") || currentUrl.includes("verify")) {
      console.log('[1688Real] Blocked by anti-bot, URL:', currentUrl);
      await context.close();
      return [];
    }

    const products = await page.evaluate(({ limit }) => {
      const results = [];
      const seen = new Set();
      const selectors = [
        ".offer-list .offer-item",
        ".offer-list-item",
        '[class*="offer-item"]',
        ".sm-offer-item",
        '[class*="offerCard"]',
        '[class*="offer-card"]',
      ];
      let items = [];
      for (const sel of selectors) {
        items = document.querySelectorAll(sel);
        if (items.length > 0) break;
      }
      for (const item of items) {
        if (results.length >= limit) break;
        try {
          let image = "";
          const img = item.querySelector("img");
          if (img) {
            image = img.src || img.getAttribute("data-src") || "";
            if (image.startsWith("//")) image = "https:" + image;
          }

          let title = "";
          const titleEl =
            item.querySelector('[class*="title"]') ||
            item.querySelector('[class*="name"]') ||
            item.querySelector("h3") ||
            item.querySelector("a");
          if (titleEl) title = (titleEl.textContent || "").trim().replace(/\s+/g, " ");

          let price = "";
          const priceEl = item.querySelector('[class*="price"]') || item.querySelector('[class*="money"]');
          if (priceEl) {
            const m = (priceEl.textContent || "").match(/([\d,.]+)/);
            if (m) price = parseFloat(m[1].replace(/,/g, ""));
          }

          let url = "";
          const linkEl = item.querySelector("a[href*='offer']") || item.querySelector("a");
          if (linkEl) {
            url = linkEl.href || "";
            if (url.startsWith("//")) url = "https:" + url;
          }

          let shop = "";
          const shopEl =
            item.querySelector('[class*="company"]') ||
            item.querySelector('[class*="shop"]') ||
            item.querySelector('[class*="store"]');
          if (shopEl) shop = (shopEl.textContent || "").trim();

          let salesInfo = "";
          const salesEl = item.querySelector('[class*="sale"]') || item.querySelector('[class*="trade"]');
          if (salesEl) salesInfo = (salesEl.textContent || "").trim();

          const key = title.substring(0, 30).toLowerCase();
          if (!key || seen.has(key)) continue;
          seen.add(key);

          if (title && price) {
            results.push({
              title,
              price: typeof price === "number" ? price : parseFloat(price) || 0,
              image,
              url,
              shop,
              salesInfo,
              platform: "1688",
            });
          }
        } catch (e) {}
      }
      return results;
    }, { limit });

    await context.close();
    return products;
  } catch (err) {
    console.log('[1688Real] Error:', err.message);
    if (browser) {
      try { await browser.close(); } catch {}
    }
    return [];
  }
}

// ============================================================
// Public API
// ============================================================
export async function search1688(keyword, options = {}) {
  const { limit = 20 } = options;
  // Decode URL-encoded UTF-8 keyword (Chinese chars may arrive encoded)
  let decodedKw = keyword;
  try { decodedKw = decodeURIComponent(keyword); } catch {}
  console.log('[1688Search] keyword="' + keyword + '" decoded="' + decodedKw + '"');

  // Check cache first
  const cached = getCached(decodedKw);
  if (cached) {
    console.log('[1688Search] Cache hit, ' + cached.length + ' products');
    return { products: cached.slice(0, limit), totalResults: cached.length, keyword: decodedKw, source: "cache" };
  }

  // Try real search
  let realProducts = [];
  try {
    realProducts = await search1688Real(decodedKw, limit);
  } catch (e) {
    console.log('[1688Search] Real search failed: ' + e.message);
  }

  if (realProducts.length > 0) {
    console.log('[1688Search] Real results: ' + realProducts.length);
    setCache(decodedKw, realProducts);
    return { products: realProducts.slice(0, limit), totalResults: realProducts.length, keyword: decodedKw };
  }

  // Fallback to mock
  const mockProducts = getMockProducts(decodedKw, limit);
  console.log('[1688Search] Using mock data: ' + mockProducts.length + ' products');
  return { products: mockProducts, totalResults: mockProducts.length, keyword: decodedKw, source: "mock" };
}
