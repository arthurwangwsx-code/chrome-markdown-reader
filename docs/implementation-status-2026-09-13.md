# 实现进展（2026-09-13）

目标：个人学习、最终公开源码，能力优先；协议只保留来源记录，不作为开发阻塞条件。

## 已落代码

- Manifest V3 独立扩展骨架，默认只有 `storage` 与 `file:///*`。
- `file://` Markdown 地址栏直读；background 本地文件读取代理；原始页面文本作为失败回退。
- Markdown/GFM 阅读：标题、表格、任务列表、脚注、KaTeX 数学、highlight.js 代码高亮与安全 HTML 清洗。
- 自动 H1–H6 目录、锚点、打印/PDF、原文视图、手动刷新。
- Mermaid、Graphviz、Vega/Vega-Lite、ECharts、PlantUML/draw.io、JSON Canvas、AntV Infographic 渲染适配器。
- Mermaid 使用 strict 安全级别；图表输入有 300 KB 单块预算。
- 独立工作区页面：File System Access 选择目录、懒展开目录、Markdown 文件过滤、文件名筛选、拖放单文件阅读。
- 浅/深色自适应、宽表格、代码、图表容器、移动端与打印样式。
- 自建 esbuild 打包流程、Release ZIP + SHA-256、TypeScript/Vitest/Playwright 骨架与综合/高级图表 fixture。
- 完整离线 HTML、EPUB 3 与 DOCX 导出；DOCX 保留标题、粗体/斜体/删除线、行内代码、链接、列表、引用、表格，并将已渲染 SVG 图表光栅化后嵌入。
- 750 KB 以上大文档采用标题扫描 + 安全分块 + IntersectionObserver 的真正惰性解析，离屏块在进入视口附近前不执行 Markdown parse/sanitize。
- 本地智能搜索：路径/文件名加权、TF-IDF 风格 IDF、CJK bigram、精确短语加权和结果摘要；不联网、不加载 embedding 模型。
- 视觉回归基线与真实商店截图资产已纳入仓库，Release 自动生成 16/32/48/128 PNG 图标。
- Chrome Web Store API V2 上传/状态/发布脚本和手工触发 GitHub Actions 已准备完成。

## 已验证

- `npm run typecheck`：通过。
- `npm test`：通过。
- `npm run build`：通过，Manifest V3 产物生成成功。
- `npm run test:e2e`：通过，5/5；真实 Chromium 中完成扩展加载、Workspace、本地多图表、高级图表、HTML/DOCX/EPUB、EPUB 内部结构、大文档虚拟化和视觉回归。
- `npm audit`：0 vulnerabilities。
- `npm run benchmark`：每个场景 3 次取中位数；11.02 MB 文档 article 中位数约 1.86 秒、100 Mermaid 正文约 0.16 秒，数据和 1MB 波动说明见性能报告。
- 经过共享模块拆分后，静态 content loader 约 163 B；富渲染依赖只在 Markdown 页面加载。
- 公有仓库已创建并推送：`https://github.com/arthurwangwsx-code/chrome-markdown-reader`。
- `v0.1.0` GitHub Release 已发布并附带 Chrome ZIP 与 SHA-256。

## 本轮新增增强

- 前台本地文件每 1.5 秒检查变化，编辑保存后自动刷新；标签页隐藏时暂停轮询。
- 最近工作区通过 IndexedDB 保存 FileSystemDirectoryHandle，重启后按浏览器权限恢复。
- 工作区支持显式建立全文索引：最多约 1500 个 Markdown、50 MB 总量、单文件 2 MB；索引落入 IndexedDB，下一轮根据 size + lastModified 复用未变化内容，只重新读取变化文件。
- 阅读器支持系统 / 护眼 / 深色主题，字号与正文宽度持久化。
- 图表增加缩放、全屏、源码复制、SVG/PNG 导出。
- 去掉存在公开安全公告的 `markdown-it-katex`，改为直接使用 KaTeX 渲染规则；测试工具链同步升级。
- JSON Canvas：文本/文件/链接/分组节点、边和标签直接在本地生成安全 SVG，包含节点/边预算。
- AntV Infographic：动态加载，渲染后转换成安全 SVG，不增加普通文档首屏必载依赖。
- 所有主要重型图表引擎改为动态 import，普通 Markdown 的 JS heap 基准从约 53.5 MB 降到约 11.2 MB；10 MB 文档耗时由约 11.4 秒改善到约 9.2 秒。
- GitHub Actions 改为 Ubuntu/macOS/Windows 三平台类型检查、单测、构建和依赖审计，Ubuntu 额外执行 Chromium 扩展 E2E。
- GitHub Actions run `34748970038` 已全部成功：Windows、Ubuntu、macOS 构建/打包 PASS，Chromium E2E PASS。

## 剩余外部前置与长期增强

v0.3.0 已完成此前第三阶段核心项目。唯一尚不能由仓库代码独立完成的是首次 Chrome Web Store item 创建：官方 V2 API 不支持创建新 item，需要开发者在 Dashboard 一次性创建条目并提供 OAuth、Publisher ID 与 Extension ID；完成后后续版本可以走仓库的自动上传/提交审核流程。

长期增强已不属于本阶段阻塞项：更精细的大文档调度、更多出版格式兼容测试、商店正式审核后的运营素材迭代。
