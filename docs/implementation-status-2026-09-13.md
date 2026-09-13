# 实现进展（2026-09-13）

目标：个人学习、最终公开源码，能力优先；协议只保留来源记录，不作为开发阻塞条件。

## 已落代码

- Manifest V3 独立扩展骨架，默认只有 `storage` 与 `file:///*`。
- `file://` Markdown 地址栏直读；background 本地文件读取代理；原始页面文本作为失败回退。
- Markdown/GFM 阅读：标题、表格、任务列表、脚注、KaTeX 数学、highlight.js 代码高亮与安全 HTML 清洗。
- 自动 H1–H6 目录、锚点、打印/PDF、原文视图、手动刷新。
- Mermaid、Graphviz、Vega/Vega-Lite、ECharts、PlantUML/draw.io 渲染适配器。
- Mermaid 使用 strict 安全级别；图表输入有 300 KB 单块预算。
- 独立工作区页面：File System Access 选择目录、懒展开目录、Markdown 文件过滤、文件名筛选、拖放单文件阅读。
- 浅/深色自适应、宽表格、代码、图表容器、移动端与打印样式。
- 自建 esbuild 打包流程、Release ZIP + SHA-256、TypeScript/Vitest/Playwright 骨架与综合图表 fixture。

## 已验证

- `npm run typecheck`：通过。
- `npm test`：通过。
- `npm run build`：通过，Manifest V3 产物生成成功。
- `npm run test:e2e`：通过，2/2；真实 Chromium 中完成扩展加载、Workspace 打开和本地 `file://` Markdown 多图表渲染。
- `npm audit`：0 vulnerabilities。
- `npm run package`：成功生成 `chrome-markdown-reader-v0.1.0-chrome.zip` 与 SHA-256。
- `dist` 约 13 MB，Release ZIP 约 4.1 MB。
- 经过共享模块拆分后，静态 content loader 约 163 B；富渲染依赖只在 Markdown 页面加载。

## 本轮新增增强

- 前台本地文件每 1.5 秒检查变化，编辑保存后自动刷新；标签页隐藏时暂停轮询。
- 最近工作区通过 IndexedDB 保存 FileSystemDirectoryHandle，重启后按浏览器权限恢复。
- 工作区支持显式建立全文索引：最多约 1500 个 Markdown、50 MB 总量、单文件 2 MB。
- 阅读器支持系统 / 护眼 / 深色主题，字号与正文宽度持久化。
- 图表增加缩放、全屏、源码复制、SVG/PNG 导出。
- 去掉存在公开安全公告的 `markdown-it-katex`，改为直接使用 KaTeX 渲染规则；测试工具链同步升级。

## 后续增强方向

后续继续增强：离线 HTML/DOCX 导出、更多 Mermaid 类型级 fixture、Canvas/Infographic 等专用适配器、工作区索引增量更新、更多真实超大文件与性能基准。
