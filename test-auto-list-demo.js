import { chromium } from 'playwright';

async function testAutoList() {
  console.log('🚀 启动自动化上架测试...\n');

  // 1. 启动浏览器
  console.log('1️⃣ 启动浏览器...');
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
    // 2. 访问淘宝卖家中心
    console.log('2️⃣ 访问淘宝卖家中心...');
    await page.goto('https://myseller.taobao.com/home.htm', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    console.log('   当前URL:', page.url());

    // 3. 检查是否需要登录
    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('passport')) {
      console.log('\n⚠️  需要登录淘宝账号！');
      console.log('   请在打开的浏览器中扫码登录...');
      console.log('   登录完成后，脚本会自动继续...\n');

      // 等待登录完成
      await page.waitForFunction(
        () => {
          const u = window.location.href;
          return u.includes('myseller.taobao.com') || u.includes('item.upload.taobao.com');
        },
        { timeout: 300000, polling: 3000 }
      );

      console.log('✅ 登录成功！');
    } else {
      console.log('✅ 已登录淘宝卖家中心');
    }

    // 4. 导航到商品发布页面
    console.log('\n3️⃣ 导航到商品发布页面...');
    await page.goto('https://item.upload.taobao.com/sell/ai/category.htm?force=true', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    console.log('   当前URL:', page.url());

    // 5. 截图保存
    console.log('\n4️⃣ 截图保存...');
    await page.screenshot({
      path: 'data/screenshots/test-auto-list.png',
      fullPage: false
    });
    console.log('   截图已保存: data/screenshots/test-auto-list.png');

    // 6. 等待用户查看
    console.log('\n5️⃣ 浏览器已打开，你可以查看页面...');
    console.log('   按 Ctrl+C 关闭浏览器并结束测试\n');

    // 保持浏览器打开
    await new Promise(() => {});

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  } finally {
    await browser.close();
  }
}

testAutoList();
