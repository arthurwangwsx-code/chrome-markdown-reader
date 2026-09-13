# Chrome Markdown Reader

面向本地技术文档的独立 Chrome Markdown 阅读扩展。

> 当前阶段：v0.3.1 在 v0.3.0 功能基线上补齐 AI Quality Loop：逐文件 coverage、安全回归、Accessibility、视觉回归、性能预算、Release 包审计、统一 `verify` / `verify:full` 和机器可读质量报告。项目以个人学习和公开源码为目标，按“能力优先、可验证、可维护”的方向持续演进。

## 已实现能力

- Chrome 地址栏直接打开 `file:///.../document.md`，原地址就地切换为阅读视图。
- Markdown/GFM、表格、任务列表、脚注、KaTeX 公式、代码高亮、安全 HTML。
- H1–H6 文章目录、中文与重复标题锚点、原文切换、打印/PDF、自动刷新。
- Mermaid（已覆盖甘特图、时序图、状态图、ER、Class、Mindmap 等 E2E 语料）、Graphviz/DOT、Vega/Vega-Lite、ECharts、PlantUML 兼容转换、draw.io。
- JSON Canvas 原生本地 SVG 渲染，以及 AntV Infographic 按需渲染。
- 图表缩放、全屏、源码复制、SVG/PNG 导出与单块复杂度预算。
- File System Access 工作区：目录树、最近工作区恢复、拖放、持久化增量索引，以及完全本地的路径/标题/正文智能排序搜索。
- 大文档渐进渲染：750 KB 以上按安全边界分块，首屏优先，离屏块进入视口附近时才解析、清洗和挂载。
- 导出：打印/PDF、单图 SVG/PNG、完整离线 HTML、富文本 DOCX、EPUB 3。
- 系统/深色/护眼主题、字号和正文宽度控制，宽表格、打印和移动端适配。
- 默认本地处理；运行时代码/WASM 随扩展打包，不依赖云端图表渲染服务。
- 轻量 content loader：仅 Markdown 页面加载共享阅读内核；Mermaid/ECharts/Vega/Graphviz/PlantUML/Infographic/DOCX 等重型能力进一步按需加载。

## 安装与使用

```sh
npm install
npm run check
npm run test:e2e
npm run benchmark
npm run package
npm run verify
npm run verify:full
npm run store:assets
```

开发者模式下选择“加载已解压的扩展程序”，指向本仓库的 `dist/`。首次使用本地地址阅读时，在 Chrome 扩展详情中开启“允许访问文件网址”。随后直接打开：

```text
file:///absolute/path/to/document.md
```

点击扩展图标可进入 Markdown Workspace，选择整个目录进行多文档阅读。

## 技术选型

最初调研以 **docu.md**、simov/markdown-viewer、Markdown Preview Enhanced、Crossnote 等为参考。最终产品采用独立 TypeScript + esbuild 架构，并直接使用成熟渲染依赖；参考仓库不参与构建。

**simov/markdown-viewer** 用于本地 URL、权限与自动刷新设计参考；其他参考项目用于目录交互、高级图表及预览能力研究。许可证、源码核查和兼容性边界见研究报告。

主要运行能力由 markdown-it、KaTeX、Mermaid、Viz.js、Vega、ECharts 以及 draw-uml/drawio2svg 等适配器组成。详细来源和基线见研究报告。

## 文档

- [总体技术方案](docs/technical-proposal-2026-09-13.md)
- [GitHub 研究与源码核查](docs/research-2026-09-13.md)
- [验收与测试计划](docs/acceptance-plan.md)
- [当前交付状态](docs/delivery-status.md)
- [实现状态](docs/implementation-status-2026-09-13.md)
- [性能基准](docs/performance-2026-09-13.md)
- [AI Quality Loop](docs/quality-loop.md)
- [Chrome Web Store 发布](docs/chrome-web-store.md)
- [Chrome Web Store Listing 草案](docs/store-listing.md)
- [参考工程说明](参考工程/README.md)

## 本地参考工程

```sh
python3 scripts/reference-repos.py clone
python3 scripts/reference-repos.py verify
python3 scripts/validate-research.py
```

`references.lock.json` 固定调研提交。参考仓库保留各自 `.git`，但整个检出内容被主仓库忽略，不进入产品构建或 Release。

## 边界

Chrome 的“允许访问文件网址”需要用户开启；文件夹树需要用户主动选择并授权目录。插件不会绕过浏览器或操作系统的权限限制。

本项目独立于 DevSpace 浏览器控制插件，不申请 debugger、cookies、history 或 nativeMessaging 权限。

Chrome Web Store 后续版本上传/提交审核已经接入 V2 API 与手工触发 GitHub Actions；首次商店 item 仍需按 Chrome 官方要求在 Developer Dashboard 创建一次，并配置对应 OAuth/Publisher/Extension ID。
