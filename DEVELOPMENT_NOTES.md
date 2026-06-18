## 踩坑记录 & 编码规则

> 记录 taobao-auto-list.js 开发过程中反复出现的问题和解决方案，防止再次犯错。

---

### 1. fillTitle() 中文乱码

**根因**：通过 page.evaluate 在浏览器环境里用 Object.getOwnPropertyDescriptor().set 直接操作 input value。这种方式绕过了 React/Vue 框架的事件绑定，中文被当成二进制字节串处理，到页面上就变成乱码。

**修复**：完全改用 Playwright 原生 page.locator().fill(title)。Playwright 的 fill() 会模拟真实的键盘输入事件，框架能正确识别中文字符。

**规则**：所有涉及中文输入的字段（标题、描述等）——**禁止**在 page.evaluate 里用 setter 写值，必须用 Playwright 的 ill()。

---

### 2. uploadImagesViaIframe() 图片上传

**根因**：硬编码依赖 iframe[src*=\"sucai-selector\"] 这个选择器。淘宝发布页改版后 iframe 名字变了或者上传机制变了，导致每次点击 slot → 等 iframe → 点\"本地上传\" → fileChooser 这套全断掉。

**修复**：改为多层 fallback 策略：
1. 找上传槽位（.sell-component-material-item-view 等）
2. 找\"本地上传\"按钮触发 fileChooser
3. fileChooser 失败则直接找 input[type=\"file\"] 用 setInputFiles

**规则**：淘宝发布页 UI 频繁更新，**避免**在代码里硬写特定 iframe src 或 class 名。优先用 Playwright 的 fileChooser 事件机制 + 按钮文本匹配，兜底用直接 file input。

---

### 3. fillBrand / fillPackaging / fillOrigin 下拉框

**根因**：三个 dropdown 函数各自有不同的 DOM 遍历逻辑、宽度/位置硬编码阈值、不同的 fallback 路径。每个函数都重复写了一遍 evaluate → 找 input → click → 等选项 → type 的逻辑，但各自阈值不同（品牌宽 30-120px，包装 100-250px），维护成本高且容易漏掉。

**修复**：统一成一套模式：遍历 input[placeholder*=\"请选择\"] → 按父元素文本匹配（品牌/包装/产地）→ click → 等 dropdown → 选第一项或 fill 默认值。

**规则**：同类型的交互（都是\"请选择\"下拉框）应该共用同一套逻辑，不要每个字段单独写。位置/宽度阈值统一放宽范围。dropdown 的 fallback 先用 ill() 输入文本 + Enter，比 page.keyboard.type() 更可靠。

---

### 4. 编译问题

改了 src/ 下的源文件后，必须执行 
pm run build 把 TypeScript 编译到 dist/，否则服务启动用的还是旧代码。项目里 	sc 编译时不报错但不表示功能没问题。
