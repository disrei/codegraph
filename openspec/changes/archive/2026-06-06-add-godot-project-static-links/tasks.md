## 1. GDScript Second-Stage Symbol Quality

- [x] 1.1 基于 AST dump 明确 `signal`、`static func`、`@export`、`@onready`、类型标注和 `class_name` 类引用的节点结构。
- [x] 1.2 扩展 `src/extraction/languages/gdscript.ts`，提取第二阶段 Godot 脚本声明与更准确的字段/属性信息。
- [x] 1.3 为静态 `class_name` 类引用补充轻量 unresolved reference 提取，并避免和普通标识符过度混淆。
- [x] 1.4 增加针对第二阶段 GDScript 符号质量的测试，覆盖声明提取、范围归属和引用质量。

## 2. Godot Scene Static Links

- [x] 2.1 设计 `.tscn` 的最小静态提取方案，明确支持的字段模式、资源路径模式和输出关系模型。
- [x] 2.2 将 `.tscn` 纳入扫描/识别路径，并接入最小静态提取逻辑。
- [x] 2.3 提取 `.tscn` 中的脚本绑定、场景继承/实例化依赖和静态外部资源路径引用。
- [x] 2.4 为 `.tscn` 提取增加样例测试，覆盖场景到脚本、场景到场景和场景到资源路径三类关系。

## 3. Verification And Real-Project Evaluation

- [x] 3.1 用最小 Godot 样例验证 `.gd` + `.tscn` 联合索引结果，确认场景文件也能进入图谱。
- [x] 3.2 在真实 Godot 项目上验证“场景 -> 脚本 -> 类名引用”主链路是否可查询、可解释。
- [x] 3.3 为重负载验证提供稳定命令并记录结果，避免把高内存测试强行塞进同一个不稳定的 Vitest run。

## 4. Documentation And Release Notes

- [x] 4.1 更新 README，明确第二阶段 GDScript 能力与 `.tscn` 最小支持范围。
- [x] 4.2 更新 CHANGELOG，说明新增的 Godot 项目级静态链接能力。
- [x] 4.3 在变更文档中明确第二阶段边界：仍不包含 NodePath、scene tree 运行时语义、autoload 和 signal connect 执行流。
