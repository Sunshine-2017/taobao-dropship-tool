# 淘宝无货源自动上架工具

> Taobao Dropship Auto-Listing Tool

基于 Playwright 浏览器自动化的淘宝无货源上架工具。支持从 1688 选品、手动导入商品、自动填写淘宝发布表单、CSV 批量导出。

---

## 这个工具做什么

打开网页 → 搜1688商品 → 选几个 → 填售价和类目 → 点一键上架 → 扫码 → 自动搞定。

**不需要你手动复制标题、价格。不需要你打开淘宝发布页。不需要你学淘宝类目体系。不需要你处理图片。** 这些重复劳动，程序替你干。

### 自动化全流程

| # | 步骤 | 谁来做 |
|---|------|--------|
| 1 | 在网页搜索1688商品 | **你** 输入关键词 → 程序拉商品列表，显示成本价 |
| 2 | 勾选要上架的商品 | **你** 勾选，点击「一键上架」 |
| 3 | 填写类目和售价 | **你** 填淘宝类目（如 `茶>代用/花草/水果/再加工茶>组合型花茶`）+ 输入每个商品想卖的价钱 |
| 4 | 启动自动上架 | 程序打开浏览器，导航到淘宝发布页 |
| 5 | 登录淘宝（仅首次） | **你** 在弹出窗口扫码登录，之后自动复用 cookie |
| 6 | 选择类目 | 程序根据你填的类目名，在淘宝类目系统搜索并选中 |
| 7 | 填写发布表单 | 程序自动填宝贝标题、**你设定的售价**、库存、品牌、包装方式、产地、运费模板 |
| 8 | 上传图片 | 程序自动从1688下载商品图片 → 上传到淘宝发布页 |
| 9 | 提交发布 | 程序点击提交按钮，检测发布成功或报错 |

### 定价逻辑

程序从1688拉取商品时会显示**成本价**。一键上架弹窗里：

```
┌──────────────────────────────────────────┐
│  金丝皇菊 大朵黄山贡菊 50g罐装  成本¥8.50  [¥___]  ← 你填售价  │
│  玫瑰花茶 特级 80g                   成本¥6.80  [¥___]  │
└──────────────────────────────────────────┘
```

每个商品一行，成本价摆在那，你填想卖多少钱。**程序不会自动定价，价格由你决定。** 你填的售价会原封不动写到淘宝发布页的"一口价"字段。

### 这个工具不做的事

### 这个工具不做的事

- ❌ **不绕开淘宝规则** — 用官方卖家中心接口，走正常发布流程
- ❌ **不存你的淘宝密码** — 扫码登录，cookie 只存在本地
- ❌ **不碰你的钱** — 不处理交易、不代收代付
- ❌ **不批量发垃圾商品** — 正常速度操作，一次只处理几个商品
- ❌ **不需要你手动传图** — 图片从1688 URL 自动下载、自动上传到淘宝

### 注意事项

**首次使用需要扫码登录。** Playwright 打开的 Chromium 是独立浏览器，没有你的淘宝登录态。首次运行会弹出浏览器窗口显示登录页，你扫码即可。只需一次，之后自动复用。

**类目必须手动填写。** 程序不知道你的商品属于淘宝哪个类目。每次一键上架前都必须填写正确的淘宝类目。填完整路径（`茶>代用/花草/水果/再加工茶>组合型花茶`）或只填叶子类目名（`组合型花茶`）都可以。填错会选到不相关的类目。

**Chrome profile 被锁怎么办。** 如果上次运行异常退出，残留 Chrome 进程会锁住 profile。报错 `browserType.launchPersistentContext: Target page, context or browser has been closed` 时，杀掉 Chrome 进程，删 lock 文件，重启。

---

## 上架方案说明

### 主方案：Playwright 浏览器自动化（当前路径）

程序启动 Playwright 内置的 Chromium（不是你日常用的 Chrome），打开淘宝千牛网页版发布商品。**登录态通过 Chrome User Data Dir 持久化**，只需首次扫码，之后自动复用。

适合：你有千牛网页版访问权限、愿意首次扫码
优点：不依赖桌面客户端、跨平台
瓶颈：类目选择依赖淘宝 AI 类目页的搜索功能，匹配精度有上限

### 备用方案：千牛 PC 客户端 + Windows UIA

**前提：你已经安装了千牛 PC 客户端。**

如果 Playwright 浏览器路径一直卡在登录或类目选择上，可以换这条路径：直接操控千牛 PC 客户端来发布商品，而不是通过浏览器打开网页版。

需要的技术：
- [Wangneal/PeekabooWin](https://github.com/wangneal/PeekabooWin) — Windows UIA + OCR 桌面自动化 MCP 服务器（Python，中文文档完整）
- 或 [SSCanine/iris-mcp](https://github.com/SSCanine/iris-mcp) — 高精度 Windows 桌面控制，Win32 + UIA + OCR 三重渲染后端

这套方案通过 **Windows UI Automation (UIA)** 识别千牛客户端的按钮、输入框、下拉菜单等界面元素，配合 **OCR** 识别页面上的文字。不需要浏览器 cookie，不需要处理网页登录态。

**相比主方案的优劣势：**

| 对比 | 浏览器 Playwright | 千牛客户端 UIA |
|------|------------------|---------------|
| 登录 | 需扫码一次，cookie 持久化 | 千牛客户端已登录，直接可用 |
| 类目选择 | 在网页 AI 类目页搜索匹配 | 千牛客户端的类目树直接点击 |
| 稳定性 | 淘宝网页可能改版导致选择器失效 | 客户端 UI 相对稳定 |
| 跨平台 | Windows/Mac/Linux | 仅 Windows |
| 图片上传 | 通过 sucai-selector iframe 自动上传 | 千牛客户端有文件选择器 |
| 实施成本 | 已实现 80% | 需要从零开发 |

---

## 快速启动

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
