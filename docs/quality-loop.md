# AI Quality Loop

本项目把测试和质量门禁设计成 AI 可以直接执行、读取结果并自动修复的闭环。功能完成不等于可提交；默认以 `npm run verify` 的结果为准。

## 一键验证

```sh
npm run verify
```

标准验证顺序：

1. TypeScript 类型检查。
2. ESLint 静态检查。
3. Vitest 单元测试 + V8 coverage 门禁。
4. 独立安全回归语料。
5. Manifest V3 构建。
6. Chromium 功能 E2E。
7. axe accessibility + 页面内键盘导航。
8. macOS 视觉基线回归。
9. Release ZIP 构建。
10. Release 内容与权限审计。
11. `npm audit --audit-level=high`。

结果同时写入 `quality/quality-report.json`。该目录不提交 Git，供 Agent、CI 或其他自动化消费。

涉及 Markdown 内核、虚拟化、图表、性能或大文档路径时使用：

```sh
npm run verify:full
```

它会额外执行 1MB、11MB、100 Mermaid 图的三次中位数真实 Chromium benchmark，并用 `scripts/performance-gate.mjs` 检查预算。

## Coverage 门禁

Unit coverage 只约束适合纯单元测试的核心逻辑，不用 mock 数字覆盖浏览器/图表集成代码：

- `src/core/search.ts`
- `src/core/virtual.ts`

门禁按**逐文件**计算：statements ≥ 50%、branches ≥ 60%、functions ≥ 40%、lines ≥ 50%。当前总体约为 statements 68.54%、branches 76.92%、functions 63.15%、lines 73.13%。

`render.ts` / `export.ts` 的安全与行为主要由 Security、真实 Chromium E2E、导出解包检查和视觉回归覆盖，避免为了 coverage 数字写没有价值的大量浏览器 mock。

## AI 改动映射

| 改动范围 | 最低验证 |
| --- | --- |
| `search.ts` / `virtual.ts` | unit + coverage；大文档改动再跑 `verify:full` |
| Markdown / sanitize / URL / SVG | `test:security` + functional E2E |
| Reader UI / CSS / 主题 | accessibility + visual + functional E2E |
| 图表 adapter | 对应 fixture + functional E2E；性能敏感时 `verify:full` |
| 导出 HTML/DOCX/EPUB | functional E2E + Release check |
| manifest / build / dependency | build + package + release check + audit |
| 发布前 | `verify:full` |

Agent 应先跑最小相关测试快速反馈，修复后再运行完整门禁。失败不能通过删除测试、放宽安全策略或静默提高性能预算来规避。

## 安全回归

`tests/security.test.ts` 目前固定验证：script/iframe/event handler 清洗、javascript 链接不可执行、远程 declarative-chart 引用识别、图表源码不直接注入、heading/math 安全渲染、未知代码块不执行。新增任何可执行/联网能力必须先新增攻击语料。

## Accessibility 与视觉

- `tests/e2e/accessibility.spec.ts`：严重/关键 axe 规则必须为零，并验证页面内键盘 Tab 顺序。
- `tests/e2e/visual.spec.ts`：1280×900 固定阅读器视觉基线。
- CI 中 accessibility 使用 Ubuntu Chromium；visual 使用 macOS runner，减少字体平台差异导致的误报。

## 性能预算

当前硬门禁使用宽于日常中位数的预算，目的是阻止明显退化而非追逐 CI 噪声：

- ~1MB：article / settled ≤ 7s。
- ~11MB：article ≤ 7s，settled ≤ 7.5s。
- 100 Mermaid：article ≤ 1.2s，settled ≤ 5s。

benchmark 每个场景跑 3 次取中位数，并写入 `quality/benchmark.json`。修改预算必须有新基准和原因记录。

## Mutation testing 说明

2026-09-13 评估了 Stryker 10 + Vitest runner。无论 `coverageAnalysis=perTest` 还是 `off`，runner 都把被现有测试覆盖的 mutants 错误报告为全部 Survived，产生不可信的 0% score；当前 Stryker/Vitest 生态也存在仍开放的 mutant verdict/static activation 问题。因此**不把失真的 mutation score 纳入门禁**。

等上游 runner 的 mutant activation 问题得到验证修复后，可重新引入 mutation testing；在此之前，以 coverage + security + E2E + accessibility + visual + performance 的多层证据作为质量水位。

## CI

GitHub Actions 分层并行运行：

- Windows / Ubuntu / macOS：typecheck、lint、coverage、build、package、release check、audit。
- Ubuntu：Chromium functional E2E。
- Ubuntu：Accessibility。
- macOS：Visual regression。
- macOS：Performance gate。

所有门禁通过后，才允许把当前提交视为质量基线。
