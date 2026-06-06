## 1. Grammar And Language Registration

- [x] 1.1 选定并验证可用的 GDScript tree-sitter grammar，生成或引入可在当前运行时稳定加载的 vendored wasm。
- [x] 1.2 在 `src/types.ts` 中注册 `gdscript` 语言，并把 `.gd` 加入默认扫描 include 规则。
- [x] 1.3 在 `src/extraction/grammars.ts` 中补充 `gdscript` 的 wasm 文件映射、扩展名映射、显示名与 vendored 加载分支。
- [x] 1.4 在 `src/extraction/languages/index.ts` 中注册 `gdscript` extractor。

## 2. Core Extraction

- [x] 2.1 基于 AST dump 明确 GDScript 的函数、类、变量、常量、枚举、调用与继承节点结构。
- [x] 2.2 新增 `src/extraction/languages/gdscript.ts`，实现第一版 extractor，覆盖 `class_name`、`func`、`var`、`const`、`enum` 与普通调用提取。
- [x] 2.3 在需要时为 GDScript 补充 `tree-sitter.ts` 核心分支，确保变量声明与特殊命名结构不会被通用 fallback 漏掉。
- [x] 2.4 实现 `load()`、`preload()` 与脚本路径 `extends` 的轻量依赖提取，并保持非静态表达式不做过度推断。

## 3. Tests And Verification

- [x] 3.1 在 `__tests__/extraction.test.ts` 中新增 GDScript 语言识别与符号提取测试。
- [x] 3.2 用样例项目或最小 Godot/GDScript 样本跑索引验证，确认 `.gd` 文件能进入图谱并产出非空节点与边。
- [x] 3.3 选取 3 个真实 GDScript/Godot 仓库完成 extraction 验证，检查节点、边、调用和路径依赖是否合理。
  说明：按当前验收决定，以真实项目 `C:\Project_A` 的完整重建和验证作为收口依据。该项目已完成旧 `.codegraph` 清理、基于当前本地构建的全量重建，以及 `files` / `query ItemSlot` / `query start_dialogue` / `callers start_dialogue` 检索验证，确认 `.gd` 文件入图、符号可查、调用关系可查、状态统计正常。
- [x] 3.4 运行 agent A/B 或等效评估，确认加入 GDScript 支持后对真实问题具备检索价值，而不是仅完成“能解析”。
  结果：已在 `C:\Project_A` 上完成等效最小 A/B 评估。选取 `start_dialogue`、`load_case`、`ItemSlot`、`DialogueResource` 4 类真实问题，对比 `CodeGraph` CLI 检索与纯 `grep/read` 文本搜索。两组都能得到正确答案，但 `CodeGraph` 组可直接返回定义、调用方和相关符号，命令链更短、歧义更少；`grep/read` 组会混入定义、调用、测试、类型注解和 preload 常量结果，需要额外人工筛选。结论：GDScript 支持已具备真实检索价值，不是仅停留在“可解析”。

## 4. Documentation And Release Notes

- [x] 4.1 更新 README 的支持语言说明，明确新增 GDScript / `.gd` 支持。
- [x] 4.2 在 `CHANGELOG.md` 的 `Unreleased` 中添加面向用户的条目，说明第一版 GDScript 支持范围。
- [x] 4.3 在变更说明或相关文档中明确第一版边界：不包含 `.tscn`、signal、scene tree、autoload 和 NodePath 解析。
