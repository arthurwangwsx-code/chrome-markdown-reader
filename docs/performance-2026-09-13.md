# 性能基准（2026-09-13）

## 环境与方法

- 日期：2026-09-13，Asia/Kuala_Lumpur。
- 浏览器：Playwright Chrome for Testing 153.0.8010.12（arm64）。
- 主机：当前 macOS Apple Silicon 开发机。
- 测量：生成临时本地 Markdown，通过真实 Manifest V3 扩展访问 `file://`；`articleMs` 为导航开始到 `.mdr-article` 可见，`settledMs` 为图表占位完成或无图表时正文稳定。
- 脚本：`npm run benchmark` / `scripts/benchmark.mjs`。

这是一轮工程基准，不是跨机器 P95。机器、浏览器和缓存状态变化都会影响绝对值。

## 首轮与拆包后对比

| 场景 | 输入大小 | 首轮 article | 动态拆包后 article | 动态拆包后 settled |
| --- | ---: | ---: | ---: | ---: |
| 约 1 MB 纯 Markdown | 1,188,007 B | 2,153 ms | 2,265 ms | 2,270 ms |
| 约 10 MB 纯 Markdown | 11,020,008 B | 11,438 ms | 9,205 ms | 9,273 ms |
| 100 Mermaid flowchart | 8,885 B | 515 ms | 377 ms | 2,345 ms |

动态拆包后的普通 1MB 场景耗时基本持平，说明该场景主要瓶颈已经不是图表库，而是 Markdown 解析、DOMPurify 和一次性大 DOM 注入。它没有达到早期技术方案中“1MB P95 ≤ 1 秒”的探索性目标，因此不将其标记为已达标。

10MB 文档改善约 19.5%，100 图正文可见时间改善约 26.8%。更明显的是内存：1MB 场景测得 JS heap 从约 **53.5 MB** 降到约 **11.2 MB**；100 图场景拆包后约 **24.5 MB**。`performance.memory` 是 Chromium 的近似指标，这里只用于同机对比。

## 当前结论

1. 动态 import 是正确方向：普通文档不再装载完整图表/导出引擎，内存显著下降，重型文档更快。
2. 10MB 级别仍能在约 9 秒内形成完整正文，但属于压力场景，不宣传为“秒开”。
3. 100 张 Mermaid 图的正文在约 0.4 秒可见，全部图表约 2.3 秒完成，能够承担大型技术文档。
4. 下一次性能跃迁需要分段/虚拟化 DOM，而不是继续微调 bundle。候选方向：按 Markdown block 分块渲染、首屏优先、IntersectionObserver 驱动块挂载、搜索/打印时临时全量展开。

## 回归要求

- 修改 Markdown 内核、sanitize、hydrate 或拆包策略后执行 `npm run benchmark`。
- 10MB article 时间退化超过 20%，或 100 图 settled 时间退化超过 25%，需要在合并前解释原因。
- 性能优化不能以关闭 DOM 清洗、放宽 Mermaid securityLevel、远程渲染或降低导出完整性作为交换。
