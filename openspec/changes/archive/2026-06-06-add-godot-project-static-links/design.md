## Context

当前仓库已经具备第一版 `gdscript-language-support`：`.gd` 文件可识别、可解析、可提取类/方法/变量/枚举/调用，以及 `load()` / `preload()` / 脚本路径 `extends` 的保守依赖。这个能力对纯脚本问题已经有价值，但仍然缺少 Godot 项目层面的关键静态连接：场景文件 `.tscn` 往往才是脚本挂载入口，很多跨文件引用通过 `class_name` 直接完成，而 `signal`、`@export`、`@onready` 这类 Godot 常见声明也尚未进入图谱。

第二阶段的目标不是做完整 Godot 语义引擎，而是在现有 CodeGraph 静态分析模型下，优先补齐“高价值、低启发式风险”的项目结构关系。换句话说，先把最值得静态建模的入口关系连起来，而不是去猜运行时节点树。

## Goals / Non-Goals

**Goals:**
- 为 `.tscn` 文件提供最小静态提取能力，至少覆盖脚本绑定、外部资源路径和基础场景继承。
- 扩展 GDScript 第二阶段符号质量，使 Godot 常见脚本声明在图谱中更接近真实开发语义。
- 补充 `class_name` 全局类引用线索，让脚本类之间的非路径式引用也能进入图谱。
- 保持现有 Node/Edge 模型和 extraction 架构一致，优先复用现有 unresolved reference / import / extends / contains 机制。

**Non-Goals:**
- 不做完整 `.tscn` 语义求值，不解析运行时实例化后的完整 scene tree。
- 不在本 change 中解析 `NodePath`、`get_node()`、`$Foo`、autoload、signal connect 执行流、RPC 或 group call。
- 不引入依赖 Godot 引擎运行时或编辑器 API 的实现方式。
- 不承诺“完整 Godot 支持”，只交付最小项目级静态结构能力。

## Decisions

### 1. `.tscn` 采用最小静态结构提取，而不是完整场景解析

**Decision**: 第二阶段对 `.tscn` 只提取可稳定静态识别的项目结构信息：`[ext_resource]` 路径、节点上的脚本绑定、`[node ... instance=ExtResource(...)]` 或场景继承入口，不尝试复原完整运行时树。

**Rationale**: 场景文件是真实 Godot 项目的入口，但完整场景语义过重。最小静态提取已经足以回答“哪个场景挂了哪个脚本”“场景依赖哪些外部脚本/资源”“哪个场景基于哪个子场景/基础场景”这些高价值问题。

**Alternatives considered**:
- 引入完整 `.tscn` 解析器：范围过大，也会把第二阶段拖成 Godot 专项项目。
- 完全忽略 `.tscn`：会继续让项目级入口缺失，削弱对真实 Godot 工程的支持价值。

### 2. `class_name` 引用优先作为静态类名线索建模

**Decision**: 第二阶段增强 GDScript 的类名引用识别，对 `Foo.new()`、类型标注、导出字段类型、显式类名引用等静态可见模式记录为类/类型相关 unresolved reference，而不是等待路径级 import 才有跨脚本关系。

**Rationale**: Godot 项目大量通过 `class_name` 做全局脚本类注册，这类引用比 `load()`/`preload()` 更接近日常脚本组织方式。如果只理解路径依赖，图谱仍然会错过大量自然问题。

**Alternatives considered**:
- 只保留路径依赖：实现简单，但对 Godot 真实代码风格覆盖不足。
- 尝试完整类名全局注册表和运行时装配：第一步太重，可以先从静态可见引用开始。

### 3. Godot 特有脚本声明先映射到现有模型

**Decision**: `signal`、`@export`、`@onready`、`static func` 等第二阶段 GDScript 语义，优先映射到现有 `NodeKind` / `UnresolvedReference` / node metadata，而不是新增 Godot 专用 kind。

**Rationale**: 这符合仓库一贯的最小改动策略，也避免为了单一生态先扩一套专门数据模型。只要问题能用现有字段表达，就优先复用现有结构。

**Alternatives considered**:
- 增加 `signal`、`scene` 等新 kind：表达更直接，但会扩大 schema 面，超出第二阶段最小目标。
- 完全不建模 Godot 声明：会继续影响字段/类/调用质量，丢失第二阶段收益。

### 4. 验证策略显式区分“功能回归”和“重负载组合验证”

**Decision**: 继续保留针对单能力的 extraction / daemon 测试，同时为 GDScript + MCP 这种高内存组合验证提供稳定的顺序执行命令，而不是要求所有重负载测试必须塞进同一个 Vitest run。

**Rationale**: 当前仓库在 Node 24 + Vitest 组合下已有 worker OOM 现象。第二阶段会继续增加 Godot 相关 grammar 和测试，如果不把验证方式显式设计出来，后面只会更脆弱。

**Alternatives considered**:
- 先解决所有 Vitest OOM 根因再推进功能：成本高，且不一定只由本 change 决定。
- 忽略组合验证问题：会让后续回归继续不稳定。

## Risks / Trade-offs

- **[` .tscn` 格式变体多，纯文本提取可能漏格式]** → 只承诺最小、稳定的字段模式，并用多个真实场景样本校验。
- **[`class_name` 引用容易和普通标识符混淆]** → 仅对静态形态明确、歧义较低的引用模式发出关系，避免激进推断。
- **[Godot 特有声明映射到现有模型后表达力有限]** → 优先保证图谱可搜索、可定位，必要时后续再单独提 spec 扩 schema。
- **[测试组合继续 OOM]** → 为重负载测试保留稳定的顺序执行命令，并在任务/验证记录中显式说明。

## Migration Plan

1. 扩展第二阶段 GDScript extractor，先补脚本级符号质量和类名引用线索。
2. 新增 `.tscn` 最小静态提取路径，接到现有扫描/索引流程里。
3. 增加样例测试和真实项目验证，先确认“场景到脚本”“脚本到类名引用”两条主路径可用。
4. 更新 README / CHANGELOG / spec，明确第二阶段新增能力与仍然不支持的边界。
5. 如果后续要进入 NodePath / signal connect / autoload 运行时语义，再单独开第三阶段 change。

## Open Questions

- `.tscn` 在本仓库中应被识别为独立语言/文件类型，还是作为 Godot 资源侧的轻量文本格式处理，更适合现有架构？
- `signal` 在第二阶段更适合建成 node、metadata，还是仅作为引用/签名信息保留？
- `class_name` 全局类引用解析是否需要额外的跨文件优先级规则，避免与同名普通标识符误配？
