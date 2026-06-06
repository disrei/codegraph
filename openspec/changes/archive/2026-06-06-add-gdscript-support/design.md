## Context

CodeGraph 现有语言接入模式是：在 `src/types.ts` 注册语言与默认 include 规则，在 `src/extraction/grammars.ts` 处理扩展名与 grammar 加载，在 `src/extraction/languages/<lang>.ts` 中实现语言专属 extractor，再通过 `__tests__/extraction.test.ts` 与真实仓库验证完成闭环。

GDScript 与 Python/Lua 在语法风格上接近，但其工程上下文属于 Godot 生态，常见依赖形式并不是传统 import，而是 `load()` / `preload()` / `extends "res://..."`。同时，当前仓库的 `tree-sitter-wasms` 分发中没有 GDScript grammar，因此不能复用现有“直接 require.resolve wasm”的路径，必须像 `lua`、`luau`、`scala`、`pascal` 那样走 vendored wasm 路线。

第一版目标是补齐“脚本可索引、可搜索、可追调用”的最小闭环，而不是一次性实现完整 Godot 语义模型。

## Goals / Non-Goals

**Goals:**
- 让 `.gd` 文件进入默认扫描范围，并被识别为 `gdscript`。
- 为 GDScript 接入稳定可用的 tree-sitter wasm grammar。
- 提取第一版高价值符号：`class_name`、`func`、`var`、`const`、`enum`、普通调用、脚本继承与脚本路径依赖。
- 为后续真实 Godot 项目上的探索、搜索、影响分析提供足够准确的图谱基础。
- 保持现有仓库语言接入模式一致，避免为了 GDScript 特判出一套新架构。

**Non-Goals:**
- 不在第一版解析 `.tscn`、`.tres`、`.godot` 或其他资源文件。
- 不在第一版建模 Godot signal、scene tree、autoload、group call、RPC、`get_node()`、NodePath 等运行时关系。
- 不新增新的 `NodeKind` 或 `EdgeKind` 来专门表示 Godot 概念。
- 不尝试把第一版做成“完整 Godot 引擎支持”。

## Decisions

### 1. 先做 `gdscript` 语言支持，不做 `godot` 框架支持

**Decision**: 第一版只引入 `gdscript` 语言能力，交付范围限制在 `.gd` 脚本与其静态可见依赖。

**Rationale**: 这能以最小范围尽快形成可用结果，同时避免把语言解析问题和 Godot 运行时语义问题耦合在一个 PR 里。用户最先需要的是“脚本能进图谱”，而不是“场景系统一次性全懂”。

**Alternatives considered**:
- 直接做完整 Godot 支持：范围过大，验证面太宽，容易把第一版拖成长期分支。
- 只做文件级识别不做 extractor：收益太低，无法兑现 CodeGraph 的主要价值。

### 2. 使用 vendored wasm grammar，而不是等待 `tree-sitter-wasms` 提供 GDScript

**Decision**: 将 GDScript grammar 的 wasm 文件纳入 `src/extraction/wasm/`，并在 `grammars.ts` 中走 vendored 分支加载。

**Rationale**: 当前分发里没有 GDScript wasm，仓库现有模式也已经支持对特定语言单独 vendoring。这样可以把可用性和 ABI 兼容性控制在仓库内，而不是依赖外部分发节奏。

**Alternatives considered**:
- 直接依赖 `tree-sitter-gdscript` npm 包运行时构建：不符合现有发布方式，也会增加安装/运行不确定性。
- 等待 `tree-sitter-wasms` 收录：交付时间不可控。

### 3. extractor 以 Python/Lua 风格为基线，并补充 GDScript 特有依赖提取

**Decision**: 复用当前 `LanguageExtractor` 模型，优先通过 `functionTypes`、`classTypes`、`variableTypes`、`callTypes` 等声明式配置实现提取；仅在必要时用 `visitNode` 或 `tree-sitter.ts` 分支处理 GDScript 的特殊节点结构。

**Rationale**: 这符合仓库现有最小改动原则。只有当变量声明或路径依赖提取无法通过通用逻辑覆盖时，才在核心提取流程中增加 GDScript 分支。

**Alternatives considered**:
- 为 GDScript 自建独立提取器管线：会偏离已有架构，维护成本高。
- 全部依赖通用 fallback：容易漏掉 GDScript 的变量、继承或路径加载形式。

### 4. 路径依赖只覆盖 `load()` / `preload()` / 脚本路径 `extends`

**Decision**: 第一版只对这三类静态最常见形式生成 import/reference 线索，不推导运行时节点访问。

**Rationale**: 这三类关系最稳定、最容易从源码静态识别，也最接近 CodeGraph 现有 import/reference 模型。继续向下做 scene tree 与 signal，只会在第一版里引入大量启发式误报风险。

**Alternatives considered**:
- 完全不做路径依赖：会让 GDScript 图谱只有“本文件内部”的价值，实际使用体验偏弱。
- 同时做 signal 与 NodePath：需要引入大量框架语义，不适合作为第一版边界。

## Risks / Trade-offs

- **[Grammar ABI 或 wasm 稳定性问题]** → 先做 grammar 健康检查，确认可在当前 `web-tree-sitter` 运行时下稳定加载，再进入 extractor 实现。
- **[AST 节点命名与预期不一致]** → 先基于样例和真实仓库跑 AST dump，再编写 extractor；不要凭语法印象硬写节点名。
- **[第一版覆盖太窄，用户误以为“Godot 已完全支持”]** → 在 README、CHANGELOG 和 proposal/design 中明确范围，只承诺 GDScript 语言支持。
- **[轻量依赖提取引入误报]** → 仅识别静态字符串路径和明确脚本路径继承形式，避免动态表达式推断。
- **[多仓库验证不足导致实际项目效果不稳定]** → 按仓库既有 add-lang 标准，至少在 3 个真实 Godot/GDScript 仓库上做验证和 A/B 评估。

## Migration Plan

1. 新增 `gdscript` 语言接线与 vendored grammar，构建产物随发布一起打包。
2. 增加最小 extractor 与测试，确保本仓库 CI 能覆盖语言识别与基本提取。
3. 用 3 个真实仓库做 extraction 验证与 agent A/B，确认不是“能跑但没价值”。
4. 更新 README 与 CHANGELOG，明确第一版范围。
5. 后续若要扩展到 Godot 场景/信号语义，作为新 change 单独推进，不在本 change 里继续扩 scope。

## Open Questions

- 选择哪个上游 GDScript grammar 版本作为 vendored 基线最稳，需要在健康检查后最终确认。
- GDScript 的 `signal`、`@export`、`@onready` 在 AST 中是否值得作为属性/修饰信息保留，需要在 AST dump 后再决定是否纳入第一版 extractor。
- `class_name` 与脚本文件名共存时，最终检索优先级如何表现，可能需要在真实仓库验证后再看是否追加细化。
