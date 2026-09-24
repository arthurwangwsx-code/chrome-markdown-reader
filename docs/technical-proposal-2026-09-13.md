# Chrome Markdown Reader：完整技术方案

日期：2026-09-13，Asia/Kuala_Lumpur。状态：方案已进入实现；v0.1.0 的真实进展见 `implementation-status-2026-09-13.md`。

## 1. 决策摘要

建设一个**独立、本地优先、只读、富渲染的 Chrome Manifest V3 扩展**。核心操作为在地址栏打开 Markdown 的本地文件 URL，不要求启动本地 HTTP 服务、不要求打开 IDE，也不依赖 DevSpace。

主要复用候选选定 **docu.md / markdown-viewer-extension**。复用其阅读内核、图表适配器、目录与主题设计，裁掉无关平台、AI 服务接入、执行型 HTML 预览及过宽网络配置，形成独立产品。参考 simov/markdown-viewer 的本地 URL 与权限设计；其他候选作为能力和体验参考。

产品采用 GPL-3.0-only 衍生路线，满足后续公开源码的方向。若 S0 无法在合理裁剪后实现安全且稳定的本地预览，则切换到 simov 的轻量扩展壳加独立渲染适配器；这是一条有明确触发条件的后备路线，不是同时维护两个产品。

**本次没有导入上游产品代码，没有产品安装包，也没有创建或推送 GitHub 公有仓库。** 所有以下功能均为目标设计，不因参考工程已实现就自动视为本项目已实现。

## 2. 目标、用户故事与范围

### 2.1 核心用户故事

1. 作为阅读本地技术方案的人，我把 `file:///.../方案.md` 放入地址栏，直接看到排版、目录、公式和图表，而不是原始文本。
2. 作为长文档读者，我通过标题目录跳转到某节，刷新和文件更新后仍能保持合理的阅读位置。
3. 作为项目文档读者，我主动选择一个文件夹，看到 Markdown 文件树和跨文件导航，不必每次重新输入文件路径。
4. 作为技术负责人，我能够查看甘特图、时序图、流程图、架构关系与数据图表；错误图表有明确诊断，不导致整页失败。
5. 作为公开项目维护者，我能从自己的仓库构建、审查并发布扩展，而不会把个人文件、参考仓库、凭证或无关依赖打包进去。

### 2.2 “强大”的工程定义

强大不等于申请最多权限、执行任意脚本或宣传支持所有语法。这里定义为：核心阅读无额外服务依赖；常见技术文档表达覆盖完整；目录、主题和交互一致；复杂与错误输入可控；能力可扩展；安全与许可证边界明确；支持情况有可复现的样例和测试证明。

正式 V1 的最低范围是 **P0 + P1**；只完成 P0 时只能称为预览版。P2 属于增强范围，不应阻塞稳定阅读能力。

| 层级 | 目标能力 | 验收要点 |
| --- | --- | --- |
| P0 | 本地 `.md`、`.markdown`、`.mdown`、`.mkd` 自动识别与原地址阅读 | 中文、空格、大小写、编码、锚点、权限未开时提示；不接管普通网页或非 Markdown 文件 |
| P0 | GFM、代码高亮、表格、任务列表、删除线、脚注、公式、提示块、frontmatter | 明确语法集，元信息不变成可执行配置；代码保持可复制原文 |
| P0 | H1–H6 文章目录、当前章节高亮、折叠、深链接、原文切换 | 重复标题与中文标题的稳定锚点、键盘可达、更新不丢定位 |
| P0 | Mermaid 甘特图、时序图、流程图、类图、状态图、ER 图、思维导图等 | 对锁定版本逐类验证；不把“Mermaid 支持”替代类型级测试 |
| P0 | 本地相对图片、文档链接、明暗主题、字号、宽度、自动刷新 | 安全路径解析，资源失败占位，前台更新不整页闪烁 |
| P1 | 用户授权的文件夹树、最近工作区、文件名搜索、跨文件跳转 | 不越权扫描；目录懒加载；撤销授权、删除/移动文件可恢复 |
| P1 | 图表缩放、平移、全屏、复制源码与 SVG/PNG 导出 | 导出不含执行内容；中文字体、背景、尺寸与当前主题一致 |
| P1 | Graphviz、Vega/Vega-Lite、ECharts、PlantUML 兼容子集、draw.io、Canvas、Infographic | 逐个适配器公布已验证语法与限制，未知类型回退原文 |
| P1 | 主题预设、宽表格、图表独立滚动、打印/PDF、可离线 HTML 导出 | 导出等待图表完成；资源能否嵌入有明确结果；无静默联网 |
| P2 | 文件夹全文检索、多栏对照、DOCX/可编辑公式导出 | 独立资源预算与兼容验证，不挤进首屏关键路径 |
| P2 | 按站点授权的远程 Markdown 阅读 | 默认关闭，单独申请来源权限，不默认接管全部网站 |

不纳入本轮产品：Markdown 写回编辑、任意代码执行、网页代理、云同步、AI 聊天/模型密钥、账号系统、Native Messaging、本地常驻服务、手机应用和浏览器控制能力。

## 3. 地址栏打开本地文档

### 3.1 预期使用方式

```text
首次安装 → 开启“允许访问文件网址”
地址栏打开 file:///.../document.md
  → 检测 Markdown
  → 读取原文
  → 显示正文与标题目录
  → 按需加载图表
```

标准入口是合法的 `file://` URL。Chrome 对直接粘贴绝对路径可能做转换，但不能承诺 `~/`、相对路径、未转义的 `#` 或 `?` 都会被正确解释。安装说明同时给出 macOS 与 Windows 的规范示例，文件选择和拖放作为替代入口。

Chrome 的文件 URL 开关必须由用户开启，扩展通过 `chrome.extension.isAllowedFileSchemeAccess` 做诊断与引导，不尝试替用户绕过或静默修改开关。[S1]

### 3.2 读取流程

静态 content script 在 file 页面启动，尽早检查 `URL.pathname` 的后缀并在非目标文件中退出。对普通文本页面使用文本节点取得原文，不能把页面 `innerHTML` 当成 Markdown 内容。原始节点和原文暂存到会话中，允许切回原文；失败时保留浏览器原始内容，而非留下一张空白页。

后续重新读取通过 FileURLProvider 实现。上游 background 的 file fetch 与 simov 的内容页 XHR 都是可参考实现；**S0 必须在目标 Chrome 上验证选定实现**，不能把扩展权限环境下的读取等同于普通网页的 fetch 权限。

地址栏保持文件 URL；文章锚点更新使用 fragment，不强制把每个文件导入另一个 extension URL。文件夹工作区是独立入口，而不是替代这一核心体验。

如果浏览器直接下载文件、没有生成可注入文档，content script 不会自动变成下载拦截器。此时提供“打开文件”或工作区入口；对服务器的 Content-Disposition 下载场景不作无条件预览承诺。

### 3.3 兼容细节

- 只对 pathname 做后缀判断，query 与 fragment 不混入扩展名。
- URL 转义和文件名解码只在各自边界进行，不反复 decode。
- 相对资源通过 `new URL(relative, documentUrl)` 或目录 handle 解析；不能把文件路径用字符串直接拼接。
- UTF-8 为默认，兼容 BOM 与 CRLF；非 UTF-8 文档提供明确编码覆盖选项，不猜错后静默重存。
- 中文/重复标题的 slug 使用统一算法，正文与目录共享同一份标题模型。
- `#章节`、跨文档 `other.md#章节`、浏览器前进后退分别测试；文件不存在给出源路径和重试入口。

## 4. 两种“目录”与授权边界

### 4.1 文章标题目录

从解析 AST 提取 H1–H6，保持层级与文档顺序。桌面阅读布局将**文章标题目录固定在右侧**；文件夹工作区把左侧留给项目文件树，使“文件 → 文档 → 章节”形成稳定的从左到右阅读路径。窄屏下优先隐藏标题目录，再按空间收起文件树。不需要扫描文件系统，也不要求文件夹授权。

### 4.2 文件夹目录树

用户从扩展的顶层工作区页面点击“选择文件夹”，调用 `showDirectoryPicker({ mode: 'read' })`，也可以把 Finder/Explorer 中的目录拖入工作区。只对选中范围建立文件树；没有授权时正常保留单文件阅读，不把整机目录作为默认数据源。[S2]

工作区树不仅展示 Markdown，还把常见纯文本（TXT/LOG/JSON/YAML/CSV/XML 等）与常见栅格图片（PNG/JPEG/GIF/WebP/AVIF/BMP）作为只读预览资源。Markdown 保持完整富渲染，纯文本使用不可执行的文本预览，图片通过本地 Blob URL 展示；其他二进制文件默认不进入可预览树。独立 SVG 文件暂不直接预览，避免把带外部资源语义的 SVG 当普通图片无条件加载。全文索引只覆盖 Markdown 与纯文本，图片不做 OCR。Markdown 在工作区中引用的相对图片和相对文档链接通过 DirectoryHandle 在**已授权根目录内**解析，禁止 `..` 越过根目录。

工作区 handle 放入 IndexedDB，不能用 JSON 序列化后丢进 chrome.storage。启动先检查权限；需要时在用户点击后请求授权。浏览器重启、授权撤销或操作系统限制后可能重新要求选择，不承诺永久免授权。[S2]

目录 handle 不提供可任意还原的绝对磁盘路径。DirectoryHandleProvider 使用 handle 与相对路径导航，不从文件夹显示名称猜出 `/Users/...`，也不把文件夹工作区与已有 file URL 会话强行做不可靠自动匹配。[S2]

默认懒展开、按需读取文件；先做文件名过滤，再把全文索引作为 P2 独立任务。默认跳过 `.git`、`node_modules`、构建缓存等目录，并提供显式调整入口。拒绝扫描超深或超大目录时必须有说明。

本设计不依赖抓取 Chrome 文件夹目录页的 DOM，更不把它当成“绕过所有系统权限”的机制。

## 5. 架构与模块职责

```text
本地 file 页面                         扩展工作区页面
Content Detector / File Reader        文件选择 / 目录树 / 最近工作区
             \                         /
              DocumentSession + SourceProvider
                              |
                Markdown AST / 标题模型 / 资源模型
                              |
                 安全转换 + Renderer Registry
                              |
         代码 / KaTeX / Mermaid / DOT / Vega / 其他图表
                              |
              隔离渲染宿主 + 会话化任务调度
                              |
              正文 / TOC / 图表交互 / 主题 / 导出

Service Worker：权限检查、受限消息路由、会话与读取代理
本地存储：设置与有界缓存；不上传文档内容与文件路径
```

### 5.1 核心接口

以下是接口设计，不是已实现 API：

```ts
type SourceKind = 'file-url' | 'directory-handle' | 'dropped-file';

interface DocumentSession {
  id: string;
  revision: number;
  sourceKind: SourceKind;
  title: string;
  sourceBase: string; // provider 内部资源基准，不保证为绝对磁盘路径
}

interface SourceProvider {
  read(signal: AbortSignal): Promise<Uint8Array>;
  resolveAsset(ref: string, signal: AbortSignal): Promise<Blob>;
  checkChanged(signal: AbortSignal): Promise<boolean>;
  dispose(): void;
}

interface DiagramAdapter {
  readonly id: string;
  readonly languages: readonly string[];
  readonly version: string;
  render(input: {
    source: string;
    theme: string;
    sessionId: string;
    revision: number;
    signal: AbortSignal;
  }): Promise<{
    kind: 'svg' | 'raster';
    output: string | Blob;
    diagnostics: readonly string[];
  }>;
}
```

接口必须补充消息 schema 与资源预算校验。异步结果带 sessionId/revision：文档切换或内容刷新后，旧任务不能覆盖新文档。

### 5.2 宿主与调度

初期保留上游 TypeScript + esbuild 路线，避免为了脚手架再引入一层 React/WXT 重写。正文 UI 与渲染内核共享模型，而不是不同入口各实现一套 Markdown。

复用并收紧已有 offscreen/iframe 渲染宿主设计；需要 DOM 的图表库不能想当然地放进 Service Worker。Service Worker 只承担有界事件任务，不能依赖其永久存活或使用它作为精确、常驻的文件监视进程。[S3]

普通解析可逐步下沉到 Worker；图表任务按会话串行或小并发调度，结束即释放不再需要的 DOM、Blob URL 与监听器。offscreen 生命周期、全局并发与多标签页路由在 S0 验证后固定为正式协议。

## 6. 渲染与样式技术选型

| 能力 | 选择与理由 | 必须保留的限制 |
| --- | --- | --- |
| Markdown | 以 docu.md 现有 unified / remark / rehype 链路为基础 | 不混用多个解析器导致目录、正文和导出语义不一致 |
| GFM 与扩展语法 | remark-gfm、数学与 CJK 处理，加提示块、脚注等明确插件 | frontmatter 只作元信息/允许的显示设置，不能改变安全策略 |
| 代码高亮 | 沿用适配过的 highlight.js，按语言按需加载 | 未知语言回退纯文本，代码不执行 |
| 数学 | KaTeX 默认，字体本地打包 | 不支持的表达式显示原式与提示；MathJax 作为后续可选适配器 |
| Mermaid | 固定经测试版本，涵盖甘特/时序等图型 | 默认 strict；锁定依赖声明与实际解析版本分别记录 |
| Graphviz | 浏览器可用的 Viz/WASM 模块 | WASM 打包到扩展，显式 CSP 配置，控制图规模 |
| Vega / Vega-Lite | 使用表达式解释器，保留声明式图表能力 | 禁止动态 JS 生成，默认禁用外部数据 loader [S4] |
| ECharts | 严格 JSON 配置适配器 | 不执行字符串函数或 formatter 源代码 |
| PlantUML | 先复用 draw-uml 转换路线并公布兼容子集 | 不等同于原生 Java PlantUML；includeurl/宏等不默认启用 |
| draw.io / Canvas / Infographic | 分别作为懒加载适配器 | 附加文件、外链、嵌入资源仍经过统一策略 |
| SVG/PNG | 安全 SVG 展示与光栅化导出 | 对渲染器输出再次验证，而非完全信任库输出 |

“支持各种图表”落实为适配器注册机制、固定示例与能力清单，不通过接受任意 JavaScript 配置实现。遇到未知 code fence，保留原文代码块；遇到已知图表的语法错误，显示该块诊断，其他正文正常阅读。

### 6.1 样式系统

采用统一设计 token 管理正文宽度、间距、字体栈、标题、代码、表格、引用、提示块及图表背景。规划 GitHub 风格、简洁阅读、技术文档、商务、学术、中文长文六类预设，分别验证浅色、深色和系统跟随。

主题数量不是质量指标。优先保证中文段落、混排、超长代码、宽表格、公式和图表在每个预设中可读。默认使用系统字体栈和许可明确的运行依赖字体，不自动加载 Google Fonts，不复制用户机器上的商业字体。

自定义主题初期只开放结构化 token，而非任意远程 CSS 或含 `url()` 的任意样式。图表缩放不改变文章字号；大图提供独立容器和全屏入口。

### 6.2 导出

先支持浏览器打印/PDF、可离线 HTML、图表 SVG/PNG。导出前必须等待目标图表渲染完成，显示无法嵌入的资源列表，并移除阅读工具栏。不能把缺图文档默默标为导出成功。

DOCX、可编辑公式、复杂分页和跨文档合并属于 P2；上游有对应能力也需要重新验证选中模块的依赖和输出质量。

## 7. 安全、权限与隐私

### 7.1 权限预算

默认只读本地文件。预计基础权限为 storage，以及采用 offscreen 宿主所需的 offscreen；host 权限限制为 `file:///*`。是否还需要某个权限必须在 S0 给出用途和测试依据，不原样沿用上游 permission 列表。

远程 Markdown 阅读是默认关闭的独立能力，在后续版本请求所选来源权限，必要的 scripting 权限也只在该方案落地时引入。默认不申请 debugger、cookies、history、nativeMessaging、unlimitedStorage 或全站 HTTP/HTTPS 权限。

Chrome API 的文件 URL 授权范围较广，因此仍须在应用内部做更窄的读取校验。应用校验不是额外的操作系统沙箱，不能宣传成阻止符号链接越界等未经验证的系统级保证。

### 7.2 文档是不可信输入

Markdown 原文、HTML、SVG、图表配置和资源 URL 全部视为不可信数据。优先使用成熟、打包到本地的清洗库或经过明确 schema 定义的 AST 清洗，而非只靠正则替换危险字符串。

安全 HTML 允许集满足常见表格、details、引用等阅读需要；移除 script、事件属性、危险协议、执行型 iframe、嵌入对象等。SVG 使用单独策略保留必要的 marker、渐变与 id 引用，同时限制可执行元素和外部资源。所有最后一次 DOM 注入都要被测试覆盖。

Mermaid 默认 strict，HTML labels 默认关闭；若影响某类图形效果，应记录为兼容边界，不能为追求“看起来支持更多”静默改为 loose。[S5]

打包所有运行时代码、WASM 与资源；不使用 CDN 注入 Mermaid、动态下载 JS 或文档指定的可执行模块。WASM 所需 CSP 与 JavaScript 的 unsafe-eval 不是同一权限；产品不引入任意 JS eval。[S6][S7]

### 7.3 资源与消息读取边界

消息 broker 验证发送者扩展 ID、tab/frame、当前会话、消息 schema 和请求类型。网页 `postMessage` 不能直接获得“读取任意本地路径”的能力。不开启 external messaging，也不把 token/路径读取接口暴露给普通页面脚本。

FileURLProvider 只为当前文档和明确允许的资源工作；解析后比较路径段和允许范围，而非简单字符串前缀匹配。默认不自动把 `../..` 等扩展为任意目录读取。文档确实需要父目录资源时，显示实际范围并要求用户明确扩大读取范围，或切换到用户选定的包含该资源的工作区。

DirectoryHandleProvider 以选中的目录 handle 为边界，按相对路径解析；不伪造绝对路径。两类 provider 保留不同授权模型，不为了统一 API 擅自扩大访问范围。

### 7.4 默认离线意味着没有隐式外联

不上传文档仅是底线。远程图片、CSS 字体、图表 data URL、PlantUML include、外部链接预取也可能产生网络请求，因此默认关闭自动外部资源加载。正文显示占位与来源，用户可以针对文档或域名显式授权；普通点击外链则由用户发起并明确离开本地阅读页面。

Vega 外部 loader、ECharts 动态函数、PlantUML includeurl、SVG 外链统一走此策略。禁止将无法离线渲染的图形悄悄发送给公共渲染服务。

最近文件路径、工作区 handle 和内容缓存只存本机；不通过 chrome.storage.sync 同步。可选同步也只包含不敏感的显示设置。提供清除最近记录、清除缓存和撤销工作区入口。

## 8. 自动刷新与性能

前台阅读会话周期性检查文件变化，更新前比较内容摘要或可用元信息，保留最接近的标题/行位置。标签页隐藏后降频或暂停；重新激活立即检查。工作区使用 handle.getFile 信息配合读取，不把文件系统观察 API 的实验能力作为唯一依赖。

Mermaid 和重型图表在正文/目录可读后懒加载，靠近视口时才渲染。缓存键包含源摘要、引擎版本、主题与安全策略版本；不能用旧策略产物绕过新的清洗规则。

每次渲染设置输入字节、图节点/边、图表数量和并发限制。`Promise.race` 超时无法中断同步 CPU 运算，因此不能只靠它防止卡死：真正可放入 Worker 的任务可 terminate，依赖 DOM 的渲染先做静态规模限制、隔离和小并发，必要时拒绝过大的图形。

以下为**待测试目标，不是已达指标**，基准机器与浏览器版本必须记录：

| 场景 | 初始目标 |
| --- | --- |
| 1 MB 以内纯文本/GFM 文档 | 正文与目录首个可用状态 P95 ≤ 1 秒，不等待所有图表 |
| 常规文档含 5 个中等图表 | 可见区域主要图表 P95 ≤ 3 秒 |
| 当前可见文件更新 | 更新可见结果通常 ≤ 2 秒，包含轮询周期，记录实际 P95 |
| 100 个图表的长文档 | 懒加载可见区域，不在首屏同步渲染全部图表 |
| 10 MB 文档 | 显示大文件提示与可用降级，不保证达到小文档指标 |
| 超出配置预算 | 可取消、可看原文、可重试，不让整页无响应 |

正式预算依据实测调整。打印/导出需要“渲染全部”，应显示进度和取消入口，不能复用视口懒加载状态后漏掉离屏图表。

## 9. 项目目录与复用方式

本机工程位于 `web/chrome-markdown-reader`，作为独立 Git 仓库；不放进 DevSpace，因为浏览器控制和文档阅读的权限、用户及发布周期不同。

### 9.1 本次已经建立

```text
chrome-markdown-reader/
├── AGENTS.md
├── README.md
├── .gitignore
├── references.json
├── references.lock.json
├── docs/
│   ├── README.md
│   ├── research-2026-09-13.md
│   ├── technical-proposal-2026-09-13.md
│   ├── acceptance-plan.md
│   └── delivery-status.md
├── scripts/
│   ├── reference-repos.py
│   └── validate-research.py
└── 参考工程/
    ├── README.md
    ├── docu-md/                    # 独立上游检出，主仓库忽略
    ├── simov-markdown-viewer/
    ├── readmd/
    ├── markdown-preview-plus/
    ├── markdown-preview-enhanced/
    └── crossnote/
```

### 9.2 实现阶段计划新增，当前尚不存在

```text
src/
  background/       # Service Worker 与权限/消息入口
  content/          # 本地文档检测与原地址阅读挂载
  reader/           # 阅读 UI、TOC、目录树、设置与原文视图
  core/             # 会话、标题模型、资源模型、任务协调
  providers/        # File URL / Directory Handle / Drop File
  renderers/        # 引擎注册与产品适配器
  security/         # 消息 schema、URL、HTML、SVG 与资源策略
  styles/           # token、主题、响应式与打印
vendor/docu-md/     # 正式复用的源码及其许可证，进入产品 Git 跟踪
public/            # 自有图标、语言资源、静态资源
tests/             # unit / e2e / security / visual / fixtures
.github/workflows/ # 构建校验与显式发布
LICENSE
THIRD_PARTY_NOTICES.md
UPSTREAM.md
```

`参考工程/` 是研究材料，不是运行时依赖。正式复用时将选定模块及其依赖闭包放入受 Git 跟踪的 `vendor/docu-md/`，保留来源路径与原始许可证；产品封装位于 src。不得让构建依赖开发者本机存在的忽略目录。

不把整个上游 Git 历史或其他参考项目复制进产品仓库。上游更新采用独立分支/批次审阅，记录基线 SHA、改动与本地补丁；禁止直接自动拉取覆盖已修改的产品实现。

## 10. 构建、依赖与公开发布

### 10.1 工具链

产品优先沿用 TypeScript、esbuild 和现有浏览器渲染方案，减少迁移风险。新工程使用项目级固定 Node 环境，初始优先验证 Node 24；本机当前检测到 Node 22.22.2，不能未经验证就宣称构建环境已经满足，也不修改其他项目的全局 Node 配置。

S0 从被选文件的真实依赖图生成最小 package.json 和精确锁文件，之后 CI 使用锁定安装。保留运行库许可证、字体许可证和 WASM 资产归属。移除不需要的 Slidev shell、AI SDK、移动端、VS Code 与编辑执行功能的构建入口。

计划定义以下产品命令，**当前尚未提供**：`typecheck`、`test:unit`、`test:e2e`、`test:security`、`build:chrome`、`package:chrome`、`check:release`。

### 10.2 公有仓库交付

候选仓库名为 `chrome-markdown-reader`，使用用户自己的 GitHub 账号。只准备方案不等于已经获准公开本机文件；创建仓库和 push 在用户明确要求时执行。

公开前必须完成：独立产品名称与图标、GPL-3.0-only 许可证文本、上游版权及修改记录、实际依赖的 THIRD_PARTY_NOTICES、隐私说明、源码构建步骤、用户权限说明和已知限制。分发二进制时提供相应版本的对应源码与构建材料；不能只公开一个不完整源码目录。[S8]

Release 建议包含 `chrome-markdown-reader-vX.Y.Z-chrome.zip`、SHA-256 校验文件、源码版本说明、第三方声明与依赖清单。扩展 ZIP 只包含正式 dist 产物，不包含参考工程、测试私有文档、浏览器 profile、token、日志、签名私钥或开发机绝对路径。

GitHub 公共源码/Release 与 Chrome Web Store 是不同交付渠道。个人测试可解压后使用“加载已解压的扩展程序”；不能承诺在 macOS/Windows 上双击任意自签 CRX 就能普遍安装或自动更新。面向普通用户的稳定分发需另行完成 Web Store 上架与审核流程。[S9]

### 10.3 CI 与供应链检查

PR 执行类型检查、单测、安全语料与 Chromium 扩展 E2E；自动浏览器验证默认使用完整 Chromium 的 new-headless 模式（`channel: chromium`），因为 Playwright 默认 headless shell 不加载扩展。人工排障才显式切换 headed。生产构建完成后检查 manifest、CSP、外部可执行资源、源文件泄露和第三方声明。构建动作与运行依赖固定版本，公开工作流使用受审查的 action 提交。

发布工作流与 PR 检查分离：未授权 PR 不访问发布密钥、不执行自动推送；正式发布由明确版本标签或人工触发控制。自动化权限使用满足流程的最小集合。

参考检出不进入 CI 产品构建。任何拿掉 `参考工程/` 就无法构建的结果，均视为发布阻塞。

## 11. 实施阶段与退出条件

| 阶段 | 工作内容 | 退出条件 |
| --- | --- | --- |
| R，当前 | GitHub 研究、源码核查、目录规划、参考克隆、方案与验收文档 | 六个检出可追溯；文档与锁文件一致；没有伪称产品完成 |
| S0，可行性与裁剪 | 最小复用闭包、项目锁文件、扩展壳、本地 URL、权限、隔离宿主 | 在目标 Chrome 中通过直读、相对图片、权限拒绝、离线与 SW 重启测试；许可证来源完整 |
| S1，核心阅读 | P0 语法、TOC、主题、Mermaid、刷新、原文与错误降级 | 核心用例全过；安全默认不靠宽松模式维持可用 |
| S2，完整 V1 | 文件夹树、全部 P1 引擎与图表交互、导出、样式矩阵 | 逐引擎兼容清单、离线资源策略、文件夹授权与输出测试完成 |
| S3，发布准备 | 多平台验证、性能、依赖审计、安装与升级验证、Release 产物 | 干净检出可构建；产品 ZIP 不含参考/隐私内容；普通安装说明经过实测 |

S0 首先验证最容易被忽略的本地读取与浏览器生命周期，不先堆主题或做营销页面。S1/S2 每阶段保持可构建的小批次改动，避免所有模块混在一次不可验证的提交里。

正式发布门槛详见 [验收与测试计划](acceptance-plan.md)。

## 12. 主要风险与应对

| 风险 | 应对 |
| --- | --- |
| 功能最丰富的上游也是依赖最复杂的上游 | 裁剪源码依赖闭包；S0 不通过则切换轻量壳，不无限扩充构建系统 |
| GPL 与未来闭源分发目标冲突 | 本轮按公开衍生产品设计；未来改变目标需重新选型，不能直接改许可证 |
| “支持 PlantUML”被理解为所有原生语法 | 公布兼容子集、测试样例和失败回退；默认不用外网服务补齐 |
| 权限足够但某个 Chrome 版本仍无法按预期读取 | 真实 Stable 验证；提供文件选择/目录工作区替代，不使用禁用安全机制的测试冒充通过 |
| 多图、大文件、恶意 DSL 导致卡顿 | 懒加载、任务预算、可终止 Worker、图规模上限与原文降级 |
| strict 模式影响 HTML labels 或链接交互 | 安全优先，显式记录不支持项；只增加经过审计的展示语法 |
| 上游默认分支和依赖继续变化 | 固定 SHA 和项目锁文件，独立评估升级，不跟随浮动 HEAD 发布 |
| 公共仓库意外包含个人文档或凭证 | ignored 参考检出、独立测试语料、Release 白名单与干净检出验证 |

## 13. 主要技术依据

- [S1 Chrome 扩展权限与文件 URL 访问](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [S2 File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
- [S3 Playwright 扩展测试与 Service Worker 生命周期](https://playwright.dev/docs/chrome-extensions)
- [S4 Vega CSP 解释器](https://vega.github.io/vega/usage/interpreter/)
- [S5 Mermaid securityLevel](https://mermaid.js.org/config/schema-docs/config-properties-securitylevel.html)
- [S6 Chrome Manifest CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
- [S7 Chrome 远程托管代码说明](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)
- [S8 docu.md 源仓库与 LICENSE](https://github.com/markdown-viewer/markdown-viewer-extension)
- [S9 Chrome 分发渠道](https://developer.chrome.com/docs/extensions/how-to/distribute)

候选的详细来源、源码文件和提交证据见 [研究报告](research-2026-09-13.md)。性能指标、未来模块结构与分阶段范围是本方案的工程设计，不是上游已经替本项目验证的事实。
