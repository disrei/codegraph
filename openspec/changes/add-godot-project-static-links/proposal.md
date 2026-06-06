## Why

第一版 GDScript 支持已经让 `.gd` 脚本进入图谱，但对真实 Godot 项目来说，价值仍主要停留在“单脚本可检索”。大量项目结构信息实际分布在 `.tscn` 场景文件、`class_name` 全局类引用以及 Godot 特有的脚本字段/信号语义里，如果这些静态关系缺失，CodeGraph 仍然很难回答“这个场景绑定了哪个脚本”“这个脚本类在哪些地方被实例化或引用”“场景切换和脚本入口如何串起来”这类高价值问题。

现在进入第二阶段，可以在不引入完整运行时语义的前提下，补齐 Godot 项目最关键的静态连接层：让 `.tscn` 与 `.gd` 之间有最小可用的关系，让 `class_name` 类引用和常见 Godot 脚本声明更像真实项目结构，从“脚本支持”升级到“项目支持”。

## What Changes

- 新增 Godot 项目级静态链接能力，最小支持 `.tscn` 场景文件中的脚本绑定、外部资源引用和基础场景继承关系提取。
- 扩展 GDScript 第二阶段符号质量，补充 `signal`、常见注解/修饰信息、`static func`、更稳定的脚本字段/属性归类，以及 `class_name` 全局类引用线索。
- 在不建模 Godot 运行时 scene tree / NodePath / autoload / signal connect 执行流的前提下，补齐“场景到脚本、脚本到脚本、类名到脚本类”的静态入口关系。
- 增加针对 `.tscn` 最小解析和第二阶段 GDScript 提取的测试、样例验证与文档说明。

## Capabilities

### New Capabilities
- `godot-project-static-links`: 为 CodeGraph 提供 Godot 项目级最小静态链接能力，覆盖 `.tscn` 到 `.gd` 的脚本绑定、场景继承和静态资源路径引用。

### Modified Capabilities
- `gdscript-language-support`: 将现有 GDScript 支持从第一版脚本级索引扩展到第二阶段符号质量，包括 `signal`、常见脚本修饰信息、`class_name` 全局类引用和更准确的字段/属性建模。

## Impact

- 受影响代码会扩展到 `src/extraction/languages/gdscript.ts`、`src/extraction/tree-sitter.ts`、新增的 Godot 场景提取路径，以及 `__tests__/extraction.test.ts` / 可能新增的场景提取测试。
- 可能需要新增 `.tscn` 文件识别、轻量 parser 或纯文本结构提取逻辑，但不要求引入完整 Godot 场景解析器依赖。
- 对外能力上，CodeGraph 会从“支持 GDScript 语言”升级到“支持 Godot 项目的最小静态结构”，但仍明确不包含 NodePath 解析、运行时节点访问、autoload、RPC 或 signal 连接流建模。
