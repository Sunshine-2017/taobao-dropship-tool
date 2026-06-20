## 踩坑记录 & 编码规则

> 记录 taobao-auto-list.js 开发过程中反复出现的问题和解决方案，防止再次犯错。

---

### 1. fillTitle() 中文乱码

**根因**：通过 page.evaluate 在浏览器环境里用 Object.getOwnPropertyDescriptor().set 直接操作 input value。这种方式绕过了 React/Vue 框架的事件绑定，中文被当成二进制字节串处理，到页面上就变成乱码。

**修复**：完全改用 Playwright 原生 page.locator().fill(title)。Playwright 的 fill() 模拟真实的键盘输入事件，框架能正确识别中文字符。

**规则**：所有涉及中文输入的字段（标题、描述等）——**禁止**在 page.evaluate 里用 setter 写值，必须用 Playwright 的 fill()。

---

### 2. uploadImagesViaIframe() 图片上传

**根因**：硬编码依赖 iframe[src*="sucai-selector"] 这个选择器。淘宝发布页改版后 iframe 名字变了或者上传机制变了，导致每次点击 slot → 等 iframe → 点"本地上传" → fileChooser 这套全断掉。

**修复**：改为多层 fallback 策略：
1. 找上传槽位（.sell-component-material-item-view 等）
2. 找"本地上传"按钮触发 fileChooser
3. fileChooser 失败则直接找 input[type="file"] 用 setInputFiles
4. 遍历所有 iframe 尝试同样操作

**规则**：淘宝发布页 UI 频繁更新，**避免**在代码里硬写特定 iframe src 或 class 名。优先用 Playwright 的 fileChooser 事件机制 + 按钮文本匹配，兜底用直接 file input + iframe 遍历。

---

### 3. fillBrand / fillPackaging / fillOrigin / fillFreight 下拉框

**根因**：四个 dropdown 函数各自有不同的 DOM 遍历逻辑、宽度/位置硬编码阈值、不同的 fallback 路径。每个函数都重复写 evaluate → 找 input → click → 等选项 → type 的逻辑，但各自阈值不同（品牌宽 30-150px，包装 100-300px），维护成本高且容易漏掉。加上淘宝发布页用 Ant Design / Fusion 组件库，实际的交互元素是 `.next-select-trigger` 或 `.ant-select-selector`，不是 input。

**修复**：重写为统一的 page.evaluate 模式：
1. 遍历所有 div/span/label/fieldset 元素
2. 按 label 文本精确匹配（"品牌"、"包装方式"、"产地"、"运费模板"）
3. 在 label 的同级/父级容器中找选择器 trigger（.next-select-trigger、.ant-select-selector 等）
4. 找不到 trigger 则找 input 用 setter 填默认值（"其他"、"袋装"、"安徽"）

**规则**：同类型的交互（下拉框/选择器）共用同一套 DOM 遍历逻辑。不要硬编码位置/宽度阈值。优先点击组件的 trigger 元素打开下拉，而不是用 fill() 输入文本。

---

### 4. 类目选择逻辑（CATEGORY_CAT_IDS）

**根因**：类目映射表 `CATEGORY_CAT_IDS` 曾在循环内部定义，后来被删除但引用代码残留，导致运行时 `ReferenceError`。修复后映射表提到文件顶层。之后又出现一个新问题：用户填完整路径（含 `>`）时，代码直接走 AI 搜索跳过了 catId 直跳，导致"未到达发布页"。

**修复**：改为优先策略——
1. 从路径提取叶子类目（"茶>代用/花草/水果/再加工茶>组合型花茶" → "组合型花茶"）
2. **优先**查 `CATEGORY_CAT_IDS` 映射表，找到 catId 直接跳转
3. 直跳失败才回退到 AI 类目搜索页，按叶子→父级→根顺序尝试不同关键词

**规则**：
- `CATEGORY_CAT_IDS` 必须在文件顶层定义，不能在任何函数体内
- 类目映射表只能用于**叶子类目**匹配，不支持完整路径直接匹配
- 每次新增类目支持，必须同时更新 `CATEGORY_CAT_IDS` 和 `resolveCategory()` 的 `categoryMap`
- **catId 是淘宝内部 ID，不保证永久有效**。如果淘宝改版导致 catId 失效，需要重新从淘宝 AI 类目页搜索结果中抓取新的 catId
- 当前映射表中的 catId（如 125242010）是从早期成功跳转记录中提取的，没有标准 API 可查询，属于"黑盒参数"

---

### 5. 编译和 dist 同步

**根因**：改了 `server/src/` 下的源文件后，服务器实际加载的是 `server/dist/` 下的编译版本。项目没有自动编译，必须手动同步。

**当前做法**（taobao-auto-list.js 是纯 JS，不需要 tsc 编译）：
```bash
cp server/src/services/taobao-auto-list.js server/dist/services/taobao-auto-list.js
# 重启后端
taskkill //F //IM node.exe
cd server && node dist/index.js
```

**规则**：
- 每次改动 src 下任何文件，**必须同步到 dist**（无论是否 ts 编译）
- 同步后必须重启后端服务（前后端不热更新，需手动杀进程重启）
- `taobao-auto-list.js` 虽然是 `.js` 文件但也是 ES 模块，放在 `src/services/` 下，对应的 dist 路径是 `dist/services/`

---

### 6. 前后端架构和通信

**项目结构关键文件：**

| 文件 | 职责 |
|------|------|
| `server/src/index.ts` | Express 入口，端口 3001 |
| `server/src/routes/listings-sqlite.ts` | 上架 API（GET/POST /auto-list 等） |
| `server/src/services/taobao-auto-list.js` | **核心** Playwright 浏览器自动化 |
| `server/src/services/auto-list-runner.js` | 后台任务调度，管理 taskId |
| `client/src/pages/ListingManager.jsx` | 上架管理前端页面 |
| `client/src/pages/Sourcing.jsx` | 1688 选品搜索页面 |
| `client/src/api/index.js` | 前端 Axios API 封装，baseURL=/api，代理到 3001 |
| `server/data/taobao-dropship.db` | SQLite 数据库 |

**上架流程（异步）：**
1. 前端 POST `/api/listings/auto-list` → 后端立即返回 `{ taskId }`
2. 后端 `auto-list-runner.js` 启动后台任务，调用 `batchListToTaobao()`
3. 前端轮询 `GET /api/listings/auto-list-task/:taskId` 获取进度
4. 前端支持取消 `POST /api/listings/auto-list-task/:taskId/cancel`

**注意**：
- 前端 axios timeout 要设为 15s（因为 auto-list 返回 taskId 很快，不需要长超时）
- 后端 auto-list-runner 是内存存储，重启后所有 task 状态丢失
- 浏览器由 Playwright 启动（独立 profile），不是用户日常用的浏览器

---

### 7. 登录态持久化机制

**流程：**
1. `launchContext()` 启动前：复制 `taobao-profile` → `taobao-profile-playwright-copy`
2. Playwright 对 copy 读写 session/cookie
3. `batchListToTaobao()` 完成后：`context.close()` → `copyProfileBack()` 把 copy 目录同步回 `taobao-profile`

**注意**：
- 源 profile 目录是 `server/data/taobao-profile/`（gitignore 已排除）
- 必须有 `context.close()` 后 profile 数据才会完全写入磁盘
- 如果报 `EADDRINUSE` 或 chrome lock 错误，先杀残留 Chrome 再重试
- 支持通过环境变量切换浏览器：`BROWSER_CHANNEL=msedge`（默认）或 `chrome`

---

### 8. 1688 搜索数据源

**现状**：1688 对 Playwright headless 搜索强制跳转到 `login.1688.com`（需要淘宝登录），真实搜索不可用。

**当前方案**：始终用 mock 数据（`sourcing-search.js` 中的 `MOCK_CATALOG`）。
- tea/herb/food/general 四个分类共 60+ 件商品
- 根据关键词匹配分类（"花茶" → tea 分类，返回 19 件花茶类商品）
- 标题/价格/店铺符合真实数据
- 图片用 `picsum.photos` 占位（**不是真实商品图片**）

**规则**：
- 搜索功能只用于演示和测试流程，不是真实 1688 货源
- 如果未来需要真实 1688 数据，需要解决 1688 反爬（验证码、登录等）
- 备选方案：Scrapling 框架 或 手动从浏览器复制商品链接导入

---

### 9. 表单字段填写可靠性

**当前各字段状态：**

| 字段 | 方法 | 可靠性 |
|------|------|--------|
| 标题 | Playwright fill() | ✅ 可靠 |
| 一口价 | page.evaluate setter + Playwright fill fallback | ✅ 可靠 |
| 总库存 | page.evaluate setter + Playwright fill fallback | ✅ 可靠 |
| 品牌 | DOM 遍历 + 点击选择器 trigger | ⚠️ 需验证 |
| 包装方式 | DOM 遍历 + 点击选择器 trigger | ⚠️ 需验证 |
| 产地 | DOM 遍历 + 点击选择器 trigger | ⚠️ 需验证 |
| 运费模板 | DOM 遍历 + 点击选择器 trigger | ⚠️ 需验证 |
| 图片 | 点击 slot → fileChooser → 文件输入 | ⚠️ 需验证 |
| 描述 | 查找 contenteditable / textarea | ⚠️ 非必填 |

**注意**：
- 品牌/包装/产地/运费都是 `page.evaluate()` DOM 遍历方式，依赖淘宝页面 DOM 结构
- 淘宝页面用 Fusion（`.next-`）或 Ant Design（`.ant-`）组件库，不同类目可能用不同版本
- 如果提交时报"必填项不能为空"，说明对应字段没填上，需要看截图分析 DOM 结构

---

### 10. 前后端变量名冲突

**问题**：`Sourcing.jsx` 中导入的 `searchSource` 函数与组件内的 `useState('searchSource')` 同名。React 组件渲染时 state 变量把函数引用覆盖了，调用时报 `searchSource is not a function`。

**修复**：导入时重命名 `import { searchSource as searchSourceAPI }`，state 变量保持不变。

**规则**：
- **不要在组件内使用与导入函数同名的 state 变量**
- 如果导入函数名与组件 state 冲突，导入时用 `as` 重命名
- 这个错误在前端运行时才会暴露（编译不报错），测试前要清空浏览器缓存确保加载最新 JS

---

### 11. 中文 UTF-8 编码

**问题**：从 curl/终端传中文到 Node.js 后端时，某些 shell 环境（尤其是 Windows Git Bash）会截断多字节 UTF-8 序列，导致 `"花茶"` 变成 `"����"`。

**修复**：
- 前端 axios 发送不会出现此问题（浏览器原生 UTF-8）
- curl 测试时用 `--data-binary @-` 和 heredoc 传 JSON
- 后端起防御作用：`try { kw = decodeURIComponent(kw); } catch {}` 确保已编码的也能解码

**规则**：
- 后端路由收到中文参数时，先尝试 `decodeURIComponent` 解码
- 前端 axios 默认 `Content-Type: application/json` + UTF-8，不会出现编码问题
- E2E 测试建议通过前端页面操作，减少 curl 直接调用的编码风险

---

### 12. 服务启动和运维

**启动命令：**
```bash
# 终端1 - 后端
cd D:\software\AI\ClaudeCode\taobao-dropship-tool\server
node dist/index.js

# 终端2 - 前端
cd D:\software\AI\ClaudeCode\taobao-dropship-tool\client
npx vite --host
```

**停止/重启：**
```bash
# 杀所有 Node 进程
taskkill //F //IM node.exe

# 或指定端口
netstat -ano | findstr 3001   # 找到 PID
taskkill //F //PID <PID>
```

**访问：**
- 前端：http://localhost:5173
- 后端 API：http://localhost:3001/api/health

---

### 13. Codex E2E 测试协作约定

1. Claude 负责代码修改、架构决策
2. Codex 负责 E2E 测试、截图分析、结果反馈
3. 接力日志在 `.codex-review.md`，Claude 每次写完代码更新接力说明
4. `.codex-context.md` 是给 Codex 看的项目上下文快照
5. 服务启动后保持运行，Codex 测试时不重启服务（除非代码有改动）
6. 测试截图和日志在 `server/data/screenshots/` 和 `server/data/logs/`
7. Codex 完成后在 `.codex-review.md` 末尾写结果，标记 `DONE - Codex`

---

## 当前问题清单（按优先级排列）

> 最后更新：2026-06-20 08:50（基于 product_3 上架测试日志）

### 🔴 P0 - 阻塞性 bug

| # | 问题 | 现象 | 根因 | 状态 |
|---|------|------|------|------|
| B1 | **类目走到"汽车零部件/养护/美容/维保"** | 上架后淘宝发布页显示的类目是"汽车零部件>>全车检测服务"，不是用户填的"花茶/组合型花茶" | CATEGORY_CAT_IDS 中所有 catId（125242010~125242017）都是编造的，不是淘宝真实的类目 ID。淘宝不认识这些 ID，返回了默认类目。 | ✅ 已修复 - 去掉 catId 直跳，改为始终 AI 搜索 |
| B2 | **包装方式未填写** | `form-done.json` 显示 `packaging: false` | page.evaluate 按"包装方式"标签文本搜索不到对应的选择器 trigger | ⚠️ 待修复 |
| B3 | **产地未填写** | `form-done.json` 显示 `origin: false` | page.evaluate 按"产地"标签文本搜索不到对应的选择器 trigger | ⚠️ 待修复 |
| B4 | **1:1主图未上传** | 提交报"1:1主图不能为空"，但 `form-done.json` 显示 `images: true` | images:true 可能误报（代码走了 else 分支未真正上传），或者上传了但页面不认 | ⚠️ 待修复 |

### 🟡 P1 - 已知但未验证

| # | 问题 | 状态 |
|---|------|------|
| V1 | 品牌字段填写（`brand: true`）是否真的选对了值 | 需 E2E 验证 |
| V2 | 运费模板字段填写（`freight: true`）是否真的选对了值 | 需 E2E 验证 |
| V3 | 图片上传的多策略（fileChooser / file input / iframe）哪条路径实际生效 | 需 E2E 验证 |
| V4 | catId 直跳是否在淘宝侧仍然有效（125242010 系列 ID 来源不明） | 需验证 |

### 🟢 P2 - 已解决/已记录

| # | 问题 | 解决方案 |
|---|------|---------|
| R1 | `CATEGORY_CAT_IDS is not defined` | 映射表提到文件顶层 |
| R2 | `searchSource is not a function` | 导入重命名 `searchSourceAPI` |
| R3 | 中文关键词乱码 | decodeURIComponent |
| R4 | 1688真实搜索被强制登录 | 改为始终用mock数据 |
| R5 | 类目路径跳过catId直跳 | 优先查映射表再AI搜索 |

### 📝 B1 详细分析（2026-06-20）

**用户操作**：填类目 `茶>代用/花草/水果/再加工茶>组合型花茶`，点一键上架

**程序行为**：
1. 提取叶子类目 "组合型花茶" → 查 CATEGORY_CAT_IDS → 得到 catId=125242014
2. 跳转 `https://item.upload.taobao.com/sell/v2/publish.htm?catId=125242014&fromAICategory=true`
3. category-done.json 显示 `status=success`，URL 确实在 publish.htm
4. **但淘宝发布页实际显示的类目是"汽车零部件/养护/美容/维保>>阿里车码头汽车服务>>全车检测服务"**

**结论**：catId=125242014 不是有效类目ID，淘宝返回了默认的"全车检测服务"类目。CATEGORY_CAT_IDS 中的所有 catId 可能都是伪造/过期的。

**需要的修复方向**：不再依赖硬编码 catId，改为始终走淘宝 AI 类目搜索页，用关键词搜索。或者通过实际搜索花茶类目从淘宝页面源码中提取真实的 catId。

### 📝 B2/B3 详细分析（2026-06-20）

**现象**：`form-done.json` 中 `packaging: false`、`origin: false`，且提交时报"必填项未填"

**可能原因**：
1. 当前类目"汽车零部件>>全车检测服务"的表单结构和花茶类目不同
2. 该默认类目的页面中标签文本不是"包装方式"和"产地"，而是其他名称
3. DOM中不存在对应的 Ant Design / Fusion 选择器 trigger

**需要的修复方向**：先解决 B1（类目正确了表单结构才对），B2/B3 可能随之解决。同时 page.evaluate 需要增强容错性。

### 📝 B4 详细分析（2026-06-20）

**现象**：`form-done.json` 中 `images: true`，但提交时报"1:1主图不能为空"

**可能原因**：
1. 代码设 `filled.images = true` 但实际没有图片文件可上传（product.images 为空）
2. 或者上传了图片但页面不认（图片格式不对/上传失败但代码没检测到）

**需要的修复方向**：
1. 在 `uploadImagesViaIframe` 中增加上传成功的严格判断（等待成功的DOM变化后才算完成）
2. 如果没有图片文件，应该在前端提示用户而不是静默跳过
