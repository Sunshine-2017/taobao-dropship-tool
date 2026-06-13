# Computer-Use 自动上架指南

> 使用截图 + 坐标点击方式实现淘宝自动上架，比 DOM 操作更稳定。

## 📋 概述

传统的 Playwright DOM 操作容易因页面结构变化而失效。Computer-Use 方式通过：
- 截图分析页面状态
- 坐标点击定位元素
- 模拟真实用户操作

## 🚀 快速开始

### 1. 校准坐标（首次使用）

首先需要校准页面元素的坐标位置：

```bash
# 方式 A: 交互式校准（推荐）
npm run calibrate

# 方式 B: 快速校准（使用估计值）
npm run calibrate:quick
```

**交互式校准流程：**
1. 浏览器会自动打开淘宝发布页面
2. 登录淘宝账号（如果需要）
3. 点击页面上的每个元素（标题框、价格框等）
4. 按 Ctrl+C 完成校准
5. 坐标会保存到 `data/element-coordinates.json`

### 2. 查看和编辑坐标

校准完成后，查看保存的坐标：

```bash
cat data/element-coordinates.json
```

坐标文件格式：
```json
{
  "titleField": { "x": 400, "y": 350, "note": "标题输入框" },
  "priceField": { "x": 400, "y": 450, "note": "价格输入框" },
  "stockField": { "x": 400, "y": 500, "note": "库存输入框" },
  "imageUpload": { "x": 200, "y": 600, "note": "图片上传区域" },
  "descriptionField": { "x": 400, "y": 700, "note": "描述编辑器" },
  "submitButton": { "x": 600, "y": 800, "note": "提交按钮" }
}
```

### 3. 测试自动上架

```bash
npm run test:computer-use
```

这会执行一次干运行（dry run），不会实际提交表单。

### 4. 实际使用

通过 API 调用：

```bash
# 干运行测试
curl -X POST http://localhost:3001/api/listings/auto-list-computer-use \
  -H "Content-Type: application/json" \
  -d '{"productIds": [1], "dryRun": true}'

# 实际上架
curl -X POST http://localhost:3001/api/listings/auto-list-computer-use \
  -H "Content-Type: application/json" \
  -d '{"productIds": [1], "dryRun": false}'
```

## 📁 文件结构

```
taobao-dropship-tool/
├── data/
│   ├── element-coordinates.json    # 保存的元素坐标
│   ├── screenshots/               # 截图（包括校准截图）
│   └── logs/                      # 操作日志
├── server/
│   ├── src/services/
│   │   ├── taobao-computer-use.js  # Computer-Use 服务
│   │   └── taobao-auto-list.js     # 原 Playwright 服务
│   ├── src/routes/
│   │   └── listings-computer-use.js # API 路由
│   └── calibrate-coordinates.js    # 坐标校准工具
└── package.json
```

## 🔧 API 接口

### POST /api/listings/auto-list-computer-use

使用 Computer-Use 自动上架商品。

**请求体：**
```json
{
  "productIds": [1, 2, 3],
  "dryRun": false
}
```

**响应：**
```json
{
  "success": true,
  "message": "Processed 3 products",
  "results": [
    {
      "productId": 1,
      "productTitle": "茉莉花茶",
      "success": true,
      "message": "Auto-listing completed"
    }
  ]
}
```

### POST /api/listings/calibrate

启动坐标校准流程。

### GET /api/listings/coordinates

获取保存的元素坐标。

### PUT /api/listings/coordinates

更新元素坐标。

## 💡 使用技巧

### 1. 坐标不准确？

如果点击位置不对，可以：
- 重新运行校准：`npm run calibrate`
- 手动编辑 `data/element-coordinates.json`
- 调整 viewport 大小（在服务配置中）

### 2. 页面布局变化？

淘宝页面可能会更新。遇到问题时：
1. 重新校准坐标
2. 检查截图确认页面状态
3. 更新坐标文件

### 3. 图片上传

图片上传需要：
1. 确保图片路径正确
2. 坐标准确指向上传区域
3. 等待上传完成（2-3秒）

### 4. 调试模式

查看详细日志：
```bash
# 查看最新日志
ls -lt server/data/logs/ | head -10

# 查看截图
ls -lt server/data/screenshots/ | head -10
```

## ⚠️ 注意事项

1. **首次使用必须校准** - 不同账号、不同浏览器的页面布局可能不同
2. **保持浏览器窗口可见** - Computer-Use 需要截屏，最小化会导致失败
3. **网络稳定** - 操作过程中不要切换网络
4. **登录状态** - 确保淘宝账号已登录

## 🔄 与原 Playwright 方式的对比

| 特性 | Playwright DOM | Computer-Use |
|------|---------------|--------------|
| 速度 | 快 | 较慢 |
| 稳定性 | 依赖页面结构 | 更稳定 |
| 维护成本 | 需要更新选择器 | 需要更新坐标 |
| 图片上传 | 复杂 | 简单 |
| 适用场景 | 页面结构固定 | 页面经常变化 |

## 🐛 故障排除

### 问题：坐标点击无效

**解决方案：**
1. 检查截图，确认页面状态
2. 重新校准坐标
3. 检查是否有弹窗遮挡

### 问题：表单提交失败

**解决方案：**
1. 查看截图，确认所有字段已填写
2. 检查是否有必填字段遗漏
3. 查看错误提示信息

### 问题：图片上传失败

**解决方案：**
1. 确认图片路径正确
2. 检查图片格式（JPG/PNG）
3. 确认坐标指向上传按钮

## 📞 获取帮助

遇到问题？查看：
- 截图：`server/data/screenshots/`
- 日志：`server/data/logs/`
- 坐标文件：`data/element-coordinates.json`
