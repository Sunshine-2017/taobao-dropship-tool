// Best-effort product info extraction from URLs
// Uses fetch to get page metadata without heavy browser rendering

export async function extractProductInfo(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const html = await response.text();

    // Try to extract title from <title> tag
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    let title = titleMatch ? titleMatch[1].trim() : '';

    // Clean up common title suffixes
    title = title.replace(/\s*[-–—|]\s*(阿里巴巴|1688|拼多多|京东|淘宝).*/i, '');
    title = title.replace(/^\s*[-–—|]\s*/, '');

    // Try to extract OG tags for better data
    const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
    if (ogTitle) title = ogTitle[1];

    const ogImage = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
    const images = ogImage ? [ogImage[1]] : [];

    // Try to get description
    const ogDesc = html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i);
    const description = ogDesc ? ogDesc[1] : '';

    // Try to extract price — 1688 often has it in JSON-LD or meta
    const priceMatch = html.match(/"price"\s*:\s*"?([\d.]+)"?/);
    let price = priceMatch ? parseFloat(priceMatch[1]) : 0;

    // Try meta price
    if (!price) {
      const metaPrice = html.match(/<meta[^>]+property="product:price:amount"[^>]+content="([^"]+)"/i);
      if (metaPrice) price = parseFloat(metaPrice[1]);
    }

    // Extract source ID
    const idMatch = url.match(/(\d{8,})/);
    const source_id = idMatch ? idMatch[1] : '';

    if (title || price || images.length > 0) {
      return { title, price, images, description, source_id, platform: detectPlatform(url), specs: {} };
    }

    return null;
  } catch {
    return null;
  }
}

function detectPlatform(url) {
  if (url.includes('1688.com')) return '1688';
  if (url.includes('pinduoduo.com') || url.includes('yangkeduo.com')) return 'pdd';
  if (url.includes('jd.com')) return 'jd';
  if (url.includes('taobao.com')) return 'taobao';
  return 'other';
}
