# 淘宝无货源自动上架工具

> Taobao Dropship Auto-Listing Tool

基于 Playwright 浏览器自动化的淘宝无货源上架工具。支持从 1688 选品、手动导入商品、自动填写淘宝发布表单、CSV 批量导出。

---

## 最终目标

在浏览器打开 Web 页面 → 点几下鼠标 → 商品自动上架到淘宝。

**不要手动复制粘贴标题、价格、图片。不要手动打开淘宝发布页。不要学淘宝繁琐的类目体系。** 这个工具就是为了消灭这些重复劳动。

## 程序要做到的事

1. **1688 选品**: 输入关键词，从 1688 搜索商品，看到价格、图片、店铺
2. **导入商品库**: 选中想要的商品，一键导入到本地库，自动计算售价（成本 × 倍率 + 固定加价）
3. **一键上架**: 在商品库勾选商品，填好淘宝类目，点「一键上架」
4. **自动登录淘宝**: Playwright 打开 Chromium，检测登录态，未登录则提示扫码，登录后自动继续
5. **自动选类目**: 根据用户填写的类目关键词，在淘宝 AI 类目页搜索并选中正确类目
6. **自动填表单**: 自动填写宝贝标题、价格、库存、品牌、包装方式、产地、运费模板
7. **自动提交**: 点击提交按钮，检测发布成功或校验错误

## 程序不做的事（重要）

- ❌ **不绕开淘宝规则** — 用官方卖家中心接口，走正常发布流程
- ❌ **不存你的淘宝密码** — 扫码登录，cookie 存在本地 Chrome profile
- ❌ **不碰你的钱** — 不处理交易、不代收代付
- ❌ **不批量发垃圾商品** — 正常速度操作，每次只处理几个商品
- ❌ **不处理图片上传** — 淘宝图片上传是纯黑盒，自动化无法突破。图片靠淘宝自动拉取 CSV 中的 URL

## 注意事项

### 首次使用需要扫码登录

Playwright 打开的 Chromium 是独立浏览器，**没有你的淘宝登录态**。首次运行会弹出浏览器窗口显示登录页，你需要扫码登录。只需一次，cookie 保存在本地，以后自动复用。

### 类目必须手动填写

系统不知道你的商品属于淘宝哪个类目。**每次一键上架前都必须填写正确的淘宝类目**（如 `茶>代用/花草/水果/再加工茶>组合型花茶`）。填完整路径或叶子类目名都可以，程序会自动提取最后一级去搜索。

类目填错会导致选到不相关的类目甚至发布失败。

### Chrome profile 会被锁

如果程序异常退出或上次运行没关干净，Chrome 进程可能残留在后台锁住 profile。这时候启动会报错：
```
browserType.launchPersistentContext: Target page, context or browser has been closed
```
解决方法：杀掉所有 Chrome 进程，清理 lock 文件，重启。

### 程序改代码要同步两份

服务器加载的是 `server/dist/` 里的编译文件，但源文件在 `server/src/`。改了 `src` 不同步 `dist` 等于白改。反过来直接改 `dist` 也要同步回 `src`。

---

## 核心链路

```
1688 选品 → 导入商品库 → 设置类目 → Playwright 自动填表 → 提交上架
                         ↘ 导出 CSV → 手动导入淘宝
```

**当前状态**: Playwright 自动填表流程已打通，但依赖用户在弹出窗口扫码登录淘宝。登录后能自动完成类目选择→填表单→提交流程。

---

## 快速启动

```bash
# 安装依赖
cd server && npm install
cd ../client && npm install

# 启动后端 (端口 3001)
cd server && node dist/index.js

# 启动前端 (端口 5173)
cd client && npx vite --host
```

访问 http://localhost:5173

---

## 项目结构

```
taobao-dropship-tool/
├── package.json               # 根配置
├── .codex-context.md          # 项目上下文（AI接力用）
├── .codex-review.md           # AI接力日志
│
├── client/                    # React前端 (Vite + Ant Design)
│   └── src/pages/
│       ├── Sourcing.jsx       # 1688选品搜索
│       ├── ProductLibrary.jsx # 商品库管理
│       ├── ListingManager.jsx # 上架管理（一键上架入口）
│       ├── Dashboard.jsx      # 仪表盘
│       └── Settings.jsx       # 设置
│
├── server/
│   ├── src/
│   │   ├── index.ts           # Express入口
│   │   ├── sqlite.ts          # SQLite数据库
│   │   ├── routes/
│   │   │   ├── listings-sqlite.ts  # 上架API（含auto-list）
│   │   │   ├── products-sqlite.ts  # 商品CRUD
│   │   │   ├── sourcing-sqlite.ts  # 选品API
│   │   │   └── settings-sqlite.ts  # 设置API
│   │   └── services/
│   │       ├── taobao-auto-list.js  # ★ 核心: Playwright自动化
│   │       ├── taobao-csv.ts        # CSV生成
│   │       ├── sourcing-search.js   # 1688搜索
│   │       ├── pricing.ts           # 定价策略
│   │       └── url-extractor.ts     # URL解析
│   ├── dist/                  # 编译后的JS（服务器实际运行的版本）
│   └── data/
│       ├── taobao-dropship.db # SQLite数据库
│       ├── taobao-profile/    # Chrome登录态（Playwright复用）
│       ├── screenshots/       # 自动化截图日志
│       ├── logs/              # 自动化JSON日志
│       └── exports/           # CSV导出
```

---

## 使用流程

### 一键上架（当前主路径）

1. 在「选品」页搜索1688商品，导入到商品库
2. 在「上架管理」页勾选商品，点击「一键上架」
3. **在弹出的对话框里填写淘宝类目**（如 `茶>代用/花草/水果/再加工茶>组合型花茶`）
4. Playwright 弹出 Chromium 窗口
5. **如果未登录**: 显示等待登录提示，在浏览器窗口扫码登录淘宝（只需一次，cookie会保存）
6. 登录后自动导航到AI类目页，用你填的类目关键词搜索并选择匹配的类目
7. 进入发布表单，自动填写标题、价格、库存、品牌等
8. 点击提交

### CSV导出（备选方案）

在上架管理页勾选商品 → 「导出CSV备份」→ 下载CSV → 在淘宝卖家中心手动导入。

---

## 关键文件: taobao-auto-list.js

这是整个自动化的核心，约1300行。主要函数：

| 函数 | 职责 | 当前状态 |
|------|------|---------|
| `launchContext()` | 启动Chromium，复用`data/taobao-profile/`登录态 | ✅ |
| `searchAndSelectCategory(page, cat)` | 打开AI类目页 → 搜索类目关键词 → 选匹配结果 → 点下一步 | ✅ 含waitForLogin |
| `fillForm(page, title, price, desc, product)` | 填宝贝标题/价格/库存/品牌/包装/产地/运费模板 | ✅ 含await修复 |
| `fillTitle()` | 输入60汉字placeholder匹配，JS setter注入 | ✅ |
| `fillBrand()` | 点击"请选择"下拉框，选第一项或输入"其他" | ⚠️ 选择器待诊断验证 |
| `fillStock()` | 填总库存=9999 | ✅ |
| `uploadImagesViaIframe()` | 图片上传（sucai-selector-ng iframe） | ⚠️ 未见实际验证 |
| `submitAndVerify()` | 点"提交宝贝信息"，检测成功/错误 | ✅ |
| `batchListToTaobao(products, overrideCategory)` | 主调度器 | ✅ 加了waitForLogin |

### 关键修复历史

| 日期 | 修复 | 文件 |
|------|------|------|
| 06-13 | 图片上传iframe路径打通 | taobao-auto-list.js |
| 06-16 | fillTitle从textarea改为input优先 | taobao-auto-list.js |
| 06-16 | fillForm所有子函数加await | taobao-auto-list.js |
| 06-16 | searchAndSelectCategory加waitForLogin(5分钟) | taobao-auto-list.js |
| 06-16 | 前端一键上架加类目输入弹窗 | ListingManager.jsx |
| 06-16 | API传overrideCategory到后端 | listings-sqlite.ts |
| 06-16 | 类目路径提取（"茶>>组合型花茶"→"组合型花茶"） | taobao-auto-list.js |
| 06-16 | 类目匹配逻辑修复（避免"花茶"匹配到"花茶机"） | taobao-auto-list.js |
| 06-17 | ProductLibrary.jsx编码修复 | ProductLibrary.jsx |

---

## 已知问题和当前阻塞点

### 1. ❌ Chrome profile 被锁

**症状**: `browserType.launchPersistentContext: Target page, context or browser has been closed`

**原因**: 前一次运行残留的 Chrome 进程锁住了 `data/taobao-profile/`

**解决**:
```bash
# 杀掉所有使用 taobao-profile 的 Chrome 进程
taskkill /F /IM chrome.exe
# 清理 lock 文件
del server\data\taobao-profile\SingletonLock
del server\data\taobao-profile\SingletonSocket
del server\data\taobao-profile\SingletonCookie
# 重启后端
cd server && node dist/index.js
```

### 2. ⚠️ 首次使用需要扫码登录

首次运行没有淘宝 cookie，Playwright 打开的 Chromium 会被重定向到登录页。当前代码会：
1. 检测到 `login`/`passport` URL → 打印 `⛔ REDIRECTED TO LOGIN PAGE`
2. 进入等待模式 → `⏳ Waiting for login (scan QR code in the browser window)...`
3. 最长等待 5 分钟，每 2 秒轮询一次 URL
4. 扫码登录后 → 自动 re-navigate 到 AI 类目页 → 继续流程
5. 超时则返回 false

只需登录一次，cookie 保存在 `data/taobao-profile/`，后续运行自动复用。

### 3. ⚠️ 类目匹配不够精准

**问题**: 用户在弹窗填 `茶>代用/花草/水果/再加工茶>组合型花茶`，代码提取叶子类目 `组合型花茶` 去搜索，但搜索结果可能不包含这个精确结果，导致选到不相关的类目（如花茶机）。

**当前修复**: 匹配逻辑要求类目关键词作为完整 segment 出现（`>>组合型花茶` 或 `组合型花茶>>`），不再做字符级别的模糊匹配。如果无匹配，选第一个结果并打 warning。

**可能的改进方向**: 
- 用淘宝API直接通过类目ID跳转（绕过AI搜索页）
- 保存常用类目的映射表
- 让用户填写更精确的类目关键词

### 4. ⚠️ 图片上传未验证

`uploadImagesViaIframe()` 走的是 sucai-selector-ng iframe + 本地上传路径。之前说七种策略都堵死，但这套 iframe 方案是新写的，实际效果未在 E2E 中验证。

### 5. ⚠️ 表单字段选择器待验证

品牌、包装、产地、运费模板的选择器基于诊断数据写的，但未在完整 E2E 中验证（因为卡在登录）。需要跑通一次确认哪些字段 true/false。

---

## 开发指南

### 修改自动化代码

`server/src/services/taobao-auto-list.js` 是源文件，但服务器实际加载的是编译后的 `server/dist/services/taobao-auto-list.js`。修改后需要**同步更新 dist**（服务器不会自动编译）。

```bash
# 1. 修改 src 版本
# 2. 手动同步修改到 dist 版本（或者直接改 dist）
# 3. 重启后端
```

### AI 接力规则

- Claude（当前）负责代码修改、架构决策
- Codex/Hermes 负责执行测试、截图分析、反馈结果
- 接力日志在 `.codex-review.md`，上下文在 `.codex-context.md`
- 重要决策和当前阻塞点记在本 README

---

## 技术栈

| 层级 | 技术 | 端口 |
|------|------|------|
| 前端 | React 18 + Vite 6 + Ant Design 5 | 5173 |
| 后端 | Node.js + Express + TypeScript | 3001 |
| 数据库 | SQLite (better-sqlite3) | - |
| 自动化 | Playwright Chromium | - |
| 登录态 | Chrome User Data Dir 持久化 | - |

---

## 最终目标

访问 `http://127.0.0.1:8765/`（或 `localhost:5173`）→ 在 Web 页面点几下 → 商品自动上架到淘宝。目前完成度约 70%，阻塞点在首次登录和类目选择。
