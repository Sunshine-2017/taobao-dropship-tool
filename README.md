# 淘宝无货源自动上架工具

> Taobao Dropship Auto-Listing Tool

一个基于 Playwright 浏览器自动化的淘宝无货源上架工具，支持从 1688 选品、自动填写商品信息、CSV 批量导出。

## 📋 项目概述

### 核心功能
- **1688 选品搜索** — 从 1688 批发平台搜索商品
- **自动上架** — Playwright 自动化填写淘宝商品发布表单
- **CSV 批量导出** — 生成淘宝兼容的 CSV 文件
- **商品管理** — 本地商品库管理（增删改查）
- **定价策略** — 自动计算售价（成本 × 倍率 + 固定加价）

### 技术栈
| 层级 | 技术 | 说明 |
|------|------|------|
| **前端** | React + Vite | SPA 应用，Ant Design UI |
| **后端** | Node.js + Express | REST API 服务 |
| **自动化** | Playwright | 浏览器自动化（Chromium） |
| **数据库** | JSON 文件 | 轻量级本地存储 |
| **浏览器** | Chromium | 淘宝登录态复用 |

---

## 🏗️ 项目结构

```
taobao-dropship-tool/
├── package.json                # 根配置（concurrently 启动前后端）
├── README.md                   # 本文档
├── .codex-context.md           # Hermes 接力上下文
├── .codex-review.md            # Claude ↔ Hermes 接力日志
│
├── client/                     # React 前端
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx            # 入口
│       ├── App.jsx             # 路由配置
│       ├── api/index.js        # API 封装
│       ├── components/
│       │   └── Layout.jsx      # 布局组件
│       └── pages/
│           ├── Dashboard.jsx   # 仪表盘
│           ├── Sourcing.jsx    # 选品页面
│           ├── ProductLibrary.jsx  # 商品库
│           ├── ListingManager.jsx  # 上架管理
│           └── Settings.jsx    # 设置页面
│
├── server/                     # Node.js 后端
│   ├── package.json
│   ├── src/
│   │   ├── index.js            # Express 入口
│   │   ├── db.js               # JSON 文件数据库
│   │   ├── routes/
│   │   │   ├── products.js     # 商品 CRUD
│   │   │   ├── listings.js     # 上架管理
│   │   │   ├── sourcing.js     # 选品搜索
│   │   │   └── settings.js     # 设置管理
│   │   └── services/
│   │       ├── taobao-auto-list.js  # 核心：Playwright 自动化
│   │       ├── taobao-csv.js        # CSV 生成
│   │       ├── sourcing-search.js   # 1688 搜索
│   │       ├── pricing.js           # 定价策略
│   │       └── url-extractor.js     # URL 解析
│   ├── find_buttons.js         # 诊断：扫描页面按钮
│   ├── test-auto-list.js       # 测试脚本
│   └── data/
│       ├── exports/            # CSV 导出目录
│       ├── logs/               # 自动化日志（截图+JSON）
│       ├── screenshots/        # 截图
│       ├── temp-images/        # 临时图片
│       ├── taobao-profile/     # 淘宝登录态（Chrome profile）
│       └── test-profile/       # 测试用临时 profile
│
└── data/                       # 本地数据
    ├── my_products.json        # 商品数据
    ├── listings.json           # 上架记录
    ├── source_products.json    # 源商品
    └── settings.json           # 配置
```

---

## 🚀 快速开始

### 1. 安装依赖

```bash
# 安装所有依赖（根目录 + server + client）
npm run install:all

# 或者分别安装
cd server && npm install
cd ../client && npm install
```

### 2. 启动服务

```bash
# 同时启动前后端（推荐）
npm run dev

# 或者分别启动
npm run dev:server  # 后端 http://localhost:3001
npm run dev:client  # 前端 http://localhost:5173
```

### 3. 访问应用

- **前端界面**: http://localhost:5173
- **后端 API**: http://localhost:3001/api

---

## 📖 使用流程

### 方式一：自动化上架（Playwright）

1. **选品** — 在「选品」页面搜索 1688 商品，添加到商品库
2. **商品管理** — 在「商品库」查看和编辑商品信息
3. **一键上架** — 在「上架管理」选择商品，点击「一键上架」
4. **扫码登录** — 首次使用需要在弹出的浏览器中扫码登录淘宝
5. **自动填写** — 工具自动填写标题、价格、库存、品牌等
6. **提交上架** — 自动点击提交按钮

### 方式二：CSV 批量导入

1. **选品** — 同上
2. **导出 CSV** — 在「上架管理」选择商品，点击「导出CSV」
3. **下载 CSV** — 下载生成的 CSV 文件
4. **导入淘宝** — 在淘宝卖家中心使用批量导入功能

---

## 🔧 核心功能详解

### 1. Playwright 自动化上架

**文件**: `server/src/services/taobao-auto-list.js`

**执行流程**:
```
1. 启动浏览器（复用登录态 profile）
2. 检查登录状态（白名单匹配 myseller/item.upload）
3. 导航到类目选择页
4. 搜索并选择类目（动态匹配）
5. 填写表单（标题、价格、库存、品牌）
6. 尝试上传图片（7种策略）
7. 点击提交按钮
8. 验证提交结果
```

**图片上传策略**（按优先级）:
1. **Strategy 7**: 点击空白图片框 + fileChooser
2. **Strategy 1-4**: 其他 fileChooser/input 方法
3. **Strategy 5**: 拖拽上传（DataTransfer API）
4. **Strategy 6**: React fiber 注入

**已知限制**: 淘宝图片上传是纯黑盒，7条路径全堵死，需要通过 CSV 方案解决。

### 2. CSV 生成

**文件**: `server/src/services/taobao-csv.js`

**CSV 格式**:
- **编码**: UTF-8（带 BOM）
- **分隔符**: 制表符（Tab）
- **图片**: 多图用 `|` 分隔

**列定义**:
| 列名 | 说明 | 示例 |
|------|------|------|
| 宝贝名称 | 商品标题 | 金丝皇菊 大朵黄山贡菊 |
| 宝贝类目 | 类目路径 | 茶>>代用/花草/水果>>组合型花茶 |
| 宝贝图片 | 图片URL（\|分隔） | url1\|url2 |
| 宝贝价格 | 售价 | 17.75 |
| 宝贝数量 | 库存 | 9999 |
| 宝贝描述 | 商品描述 | 黄山徽味茶业 |
| 运费模板 | 运费设置 | 包邮 |

### 3. 1688 选品搜索

**文件**: `server/src/services/sourcing-search.js`

**功能**:
- 关键词搜索 1688 商品
- 解析商品标题、价格、图片、店铺
- 支持 Mock 数据（搜索失败时回退）

---

## 🗄️ 数据存储

### 商品数据 (`data/my_products.json`)
```json
{
  "id": 2,
  "source_product_id": 12,
  "title": "金丝皇菊 大朵黄山贡菊 50g罐装 花草茶",
  "cost_price": 8.5,
  "selling_price": 17.75,
  "profit_margin": 52.11,
  "description": "黄山徽味茶业",
  "images": "[\"url1\", \"url2\"]",
  "category": "",
  "tags": "花茶",
  "platform": "1688",
  "status": "ready",
  "created_at": "2026-06-07T01:00:24.925Z",
  "updated_at": "2026-06-09T01:36:50.616Z"
}
```

**状态说明**:
- `draft` — 草稿
- `ready` — 待上架
- `listed` — 已上架
- `failed` — 上架失败

### 上架记录 (`data/listings.json`)
```json
{
  "id": 36,
  "product_id": 2,
  "taobao_item_id": null,
  "status": "pending",
  "csv_path": "C:\\...\\taobao-listings-2026-06-13.csv",
  "listed_at": null,
  "created_at": "2026-06-13T00:47:55.433Z"
}
```

---

## 🔌 API 接口

### 商品管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/products | 获取商品列表 |
| POST | /api/products | 创建商品 |
| PUT | /api/products/:id | 更新商品 |
| DELETE | /api/products/:id | 删除商品 |

### 上架管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/listings | 获取上架记录 |
| POST | /api/listings/auto-list | 自动上架（Playwright） |
| POST | /api/listings/generate-csv | 生成 CSV |
| GET | /api/listings/download/:fileName | 下载 CSV |
| PUT | /api/listings/:id | 更新上架状态 |
| DELETE | /api/listings/:id | 删除上架记录 |

### 选品搜索

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/sourcing/search?keyword=xxx | 搜索 1688 商品 |

### 设置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/settings | 获取设置 |
| PUT | /api/settings | 更新设置 |

---

## ⚙️ 配置项

### 定价策略 (`data/settings.json`)
```json
{
  "price_multiplier": "1.8",    // 成本倍率
  "price_fixed_add": "5",       // 固定加价
  "default_category": "中药茶/中药饮品",
  "default_freight_template": "包邮"
}
```

### 环境变量
| 变量 | 说明 | 默认值 |
|------|------|--------|
| PORT | 后端端口 | 3001 |
| TAOBAO_PROFILE_DIR | Chrome profile 路径 | ./data/taobao-profile |

---

## 🐛 问题排查

### 1. 浏览器启动失败
**症状**: `Target page, context or browser has been closed`

**原因**: Chrome profile 被其他进程锁定

**解决**:
```bash
# 杀掉所有 node 进程
taskkill /F /IM node.exe

# 或者使用不同 profile
set TAOBAO_PROFILE_DIR=C:\path\to\new\profile
node src/index.js
```

### 2. 登录检测失败
**症状**: 一直在登录页等待

**原因**: 登录检测逻辑问题

**解决**: 检查 `taobao-auto-list.js` 中的登录检测代码，确保白名单包含正确的 URL。

### 3. 类目选择失败
**症状**: 类目搜索无结果

**原因**: 淘宝页面结构变化

**解决**: 检查 `searchAndSelectCategory()` 函数，更新选择器。

### 4. 表单填写不完整
**症状**: 部分字段未填写

**原因**: 页面元素变化或验证错误

**解决**: 检查 `fillForm()` 函数，更新字段选择器。

### 5. 图片上传失败
**症状**: `images: false`

**原因**: 淘宝图片上传是纯黑盒，浏览器自动化无法突破

**解决**: 使用 CSV 方案，图片 URL 填入 CSV，淘宝会自动拉取。

---

## 📊 日志系统

### 日志位置
- **截图**: `server/data/screenshots/`
- **JSON 日志**: `server/data/logs/`
- **CSV 导出**: `server/data/exports/`

### 日志格式
```
product_{id}_{timestamp}_{step}.json
product_{id}_{timestamp}_{step}.png
```

**步骤说明**:
- `enter-search` — 进入类目选择页
- `category-done` — 类目选择完成
- `form-done` — 表单填写完成
- `submit-done` — 提交完成
- `submit-error` — 提交错误
- `form-error` — 表单错误

---

## 🔄 Claude ↔ Hermes 接力系统

### 文件说明
- `.codex-context.md` — 项目上下文（Claude 写，Hermes 读）
- `.codex-review.md` — 接力日志（双方读写）

### 接力规则
1. Claude 写入 `.codex-context.md` → Hermes 读取
2. Hermes 将回复写在 `.codex-review.md` 末尾
3. 完成后标记 `DONE - Hermes` 或 `BLOCKED - Hermes`
4. 接力顺序：Claude → Hermes → Claude（每轮 ~10 分钟窗口）

---

## 📝 开发历史

### 2026-06-07
- 项目初始化
- 实现 1688 选品搜索
- 实现基础商品管理

### 2026-06-09
- Hermes 修复登录检测 bug
- Hermes 重写核心自动化代码
- 实现 CSV 批量导出

### 2026-06-11
- Claude 定位提交按钮（「提交宝贝信息」）
- Claude 发现图片上传是黑盒
- Hermes 实现 7 种图片上传策略（全部失败）
- 转向 CSV 方案解决图片问题

### 2026-06-13
- CSV 生成优化（动态类目、多图片、实际价格）
- 项目功能完整，可投入使用

---

## 🎯 后续优化

### 短期
- [ ] 优化 CSV 格式（适配最新淘宝批量导入模板）
- [ ] 添加更多商品类目映射
- [ ] 优化错误处理和重试机制

### 中期
- [ ] 淘宝开放平台 API 集成
- [ ] 批量多商品支持
- [ ] 定时任务（自动检查上架状态）

### 长期
- [ ] 多平台支持（拼多多、京东）
- [ ] 智能定价（基于市场数据）
- [ ] 数据分析和报表

---

## 📄 许可证

MIT License

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📞 联系方式

- GitHub: https://github.com/Sunshine-2017/taobao-dropship-tool
