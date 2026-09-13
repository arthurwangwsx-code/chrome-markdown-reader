# 性能基准（2026-09-13）

## 环境与方法

- 日期：2026-09-13，Asia/Kuala_Lumpur。
- 浏览器：Playwright Chrome for Testing 153.0.8010.12（arm64）。
- 主机：当前 macOS Apple Silicon 开发机。
- 测量：生成临时本地 Markdown，通过真实 Manifest V3 扩展访问 `file://`；`articleMs` 为导航开始到 `.mdr-article` 可见，`settledMs` 为图表占位完成或无图表时正文稳定。
- 脚本：`npm run benchmark` / `scripts/benchmark.mjs`。

这是一轮工程基准，不是跨机器 P95。机器、浏览器和缓存状态变化都会影响绝对值。

## v0.3.0：动态拆包 + 惰性分块解析

当前脚本每个场景执行 3 次，并以中位数作为汇总值，同时保留原始 run。以下是最终 v0.3.0 本机结果：

| 场景 | 输入大小 | article 中位数 | settled 中位数 | JS heap 中位数 |
| --- | ---: | ---: | ---: | ---: |
| 约 1 MB 纯 Markdown | 1,188,007 B | 4,133 ms | 4,135 ms | 12.7 MB |
| 约 10 MB 纯 Markdown | 11,020,008 B | 1,861 ms | 1,864 ms | 47.4 MB |
| 100 Mermaid flowchart | 8,885 B | 162 ms | 2,128 ms | 20.5 MB |

约 1 MB 场景三次为 4,133 / 4,992 / 2,550 ms，波动较大，并未达到早期“1MB P95 ≤ 1 秒”的探索性目标。该样例由大量没有章节边界的短段落构成，会频繁触发安全强制分块和浏览器布局；当前只把它作为压力回归数据，不把单机中位数宣传成通用性能结论。

约 10 MB 场景三次 article 为 1,934 / 1,861 / 1,841 ms。相比 v0.2.0 拆包后的约 9.2 秒，真正惰性解析带来了数量级改善：首屏只扫描标题并解析前两个块，其余块由 IntersectionObserver 接近视口时解析和清洗。

100 图场景三次 article 为 162 / 169 / 155 ms，全部图完成约 2.1 秒。它没有达到虚拟化阈值，验证了普通中小文档不受大文档策略拖累。

## 当前结论

1. 动态 import 与真正惰性的 Markdown 分块解析都已落地；750 KB 以上文档不再预先 parse/sanitize 全文。
2. 11 MB 压力文档首个可用状态已经从 v0.2.0 的约 9.2 秒下降到约 1.86 秒中位数。
3. 100 张 Mermaid 图正文约 0.16 秒可见，全部图约 2.13 秒完成。
4. 1 MB 无章节压力样例仍有明显波动，下一步性能研究应聚焦分块器自适应、主线程长任务与 Chrome 冷启动，而不是继续牺牲安全清洗。

## 回归要求

- 修改 Markdown 内核、sanitize、hydrate 或拆包策略后执行 `npm run benchmark`。
- 10MB article 中位数退化超过 25%，或 100 图 settled 中位数退化超过 25%，需要在合并前解释原因。
- 性能优化不能以关闭 DOM 清洗、放宽 Mermaid securityLevel、远程渲染或降低导出完整性作为交换。
