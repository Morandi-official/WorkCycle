# WorkCycle

一个适合部署到 Cloudflare Pages 的月度工作记录网站。

域名：`log.morandi.dpdns.org` 或 `worklog.morandi.dpdns.org`（长域名存在BUG，暂停使用）

## 功能

- 以“月”为主体显示当月日历。
- 每周三显示“汇报日”标记。
- 每周四至下周三作为一个工作周期，用浅色背景分隔。
- 每一天都可以填写工作内容。
- 支持对选中的文字添加浅色荧光标注。
- 绑定 Cloudflare D1 后，记录会保存到云端；未绑定 D1 时，会自动保存到当前浏览器本地。

## Cloudflare Pages 部署参数

```text
Framework preset: None
Build command: 留空 或 exit 0
Build output directory: /
Root directory: 留空
```

## D1 绑定

在 Pages 项目的 Settings → Bindings 中添加 D1 database：

```text
Variable name: DB
Database name: workcycle-db
```

绑定后重新部署一次。

## 自定义域名

建议在 Pages → Custom domains 中添加：

```text
log.morandi.dpdns.org
```

如果 Cloudflare 没有自动创建 DNS，请添加：

```text
Type: CNAME
Name: log
Target: 你的 Pages 默认域名，例如 workcycle.pages.dev
Proxy status: Proxied
```

## 更新记录

### 2026-05-25

#### 荧光标注选项与清除功能修复

- 在原有黄色、绿色、蓝色、粉色基础上，新增橙色、紫色、灰色 3 个荧光标注选项。
- 修复“清除”按钮无效的问题。
- 清除按钮现在支持两种操作：如果选中了文字，只清除选中文字中的荧光标注；如果没有选中文字，则清除当前编辑区里的全部荧光标注。
- 优化编辑器选区保存逻辑，避免点击荧光按钮时选区丢失。
- 同步更新日历格预览逻辑，新增颜色也能在日历格中显示。
- 更新 `index.html` 资源版本号，避免浏览器或 Cloudflare 继续加载旧脚本。

#### 更新记录维护方式调整

- 后续更新记录统一写在 `README.md` 的“更新记录”部分。
- 删除独立的 `CHANGELOG.md` 文件。

#### 日历格荧光标注显示修复

- 修复日历格预览只显示纯文字、不显示荧光标注的问题。
- 修改 `app.js`：日历格预览从纯文本渲染改为安全保留 `mark[data-color]` 标签。
- 修改 `styles.css`：为日历格中的黄色、绿色、蓝色、粉色荧光标注补充样式。
- 修改 `index.html`：更新资源版本号，避免浏览器或 Cloudflare 缓存旧脚本。

#### 空白日期显示优化

- 修改 `app.js`：没有填写内容的日期格子保持空白。
- 移除空白日期格中原先显示的“点击填写今日工作内容”。
- 修改 `index.html`：更新资源版本号，避免继续加载旧脚本。

#### 页面布局压缩优化

- 修改 `index.html`：将页面主体改为两栏布局。
- 修改 `styles.css`：压缩顶部标题、月份栏、图例和日历格高度。
- 将编辑区放到右侧，减少页面垂直滚动。
- 右侧编辑区使用 sticky 布局，方便在查看日历时保持编辑入口可见。
- 缩短荧光按钮文案为“黄 / 绿 / 蓝 / 粉 / 清除”。

#### 初版功能构建

- 新建 WorkCycle 月度工作记录网站。
- 新增 `index.html`：页面结构，包括标题、月份切换、图例、月历、每日记录编辑区。
- 新增 `styles.css`：浅色风格、日历格、周期底色、汇报日标记、编辑器和荧光按钮样式。
- 新增 `app.js`：月份切换、日期选择、每日记录编辑、自动保存、荧光标注、本地存储回退。
- 新增 `functions/api/records.js`：Cloudflare Pages Functions API，用于通过 D1 保存和读取每日工作记录。
- 新增 `README.md`：部署说明、D1 绑定说明、推荐域名说明。
