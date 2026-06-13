import { chromium } from 'playwright';

async function checkBrowserState() {
  console.log('🔍 检查浏览器状态...\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'zh-CN'
  });

  const page = await context.newPage();

  try {
    // 访问淘宝卖家中心
    console.log('📍 访问淘宝卖家中心...');
    await page.goto('https://myseller.taobao.com/home.htm', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    const currentUrl = page.url();
    console.log('   当前URL:', currentUrl);

    // 检查是否已登录
    if (currentUrl.includes('myseller.taobao.com')) {
      console.log('✅ 已登录淘宝卖家中心！');

      // 截图保存
      const { existsSync, mkdirSync } = await import('fs');
      const { join } = await import('path');

      const screenshotDir = join(process.cwd(), 'data', 'screenshots');
      if (!existsSync(screenshotDir)) mkdirSync(screenshotDir, { recursive: true });

      await page.screenshot({
        path: join(screenshotDir, 'seller-home.png'),
        fullPage: false
      });
      console.log('📸 截图已保存: data/screenshots/seller-home.png');

      // 导航到商品发布页面
      console.log('\n📍 导航到商品发布页面...');
      await page.goto('https://item.upload.taobao.com/sell/ai/category.htm?force=true', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      console.log('   当前URL:', page.url());

      await page.screenshot({
        path: join(screenshotDir, 'upload-page.png'),
        fullPage: false
      });
      console.log('📸 截图已保存: data/screenshots/upload-page.png');

    } else if (currentUrl.includes('login')) {
      console.log('⚠️  需要登录淘宝账号');
      console.log('   请在浏览器中扫码登录...');
    }

    console.log('\n✅ 浏览器状态检查完成');
    console.log('   按 Ctrl+C 关闭浏览器\n');

    // 保持浏览器打开
    await new Promise(() => {});

  } catch (error) {
    console.error('❌ 检查失败:', error.message);
  } finally {
    await browser.close();
  }
}

checkBrowserState();
