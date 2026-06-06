## Why

CodeGraph 目前还不能索引 Godot 项目中最核心的 `.gd` 脚本，导致用户无法对 GDScript 代码执行搜索、调用链追踪和影响分析。现在补齐第一版 GDScript 支持，可以先覆盖 Godot 项目中最有价值的脚本层语义，并为后续扩展到场景、signal 和资源关系打下稳定基础。

## What Changes

- 新增 `gdscript` 语言支持，识别并索引 `.gd` 文件。
- 接入 GDScript tree-sitter 语法，采用仓库内 vendored wasm 方式加载，不依赖 `tree-sitter-wasms` 预置分发。
- 为 GDScript 增加最小可用 extractor，覆盖类、函数/方法、变量/常量、枚举、调用关系与脚本继承关系。
- 增加针对 `load()`、`preload()` 以及脚本路径 `extends` 的轻量依赖提取，便于脚本级引用追踪。
- 增加测试、真实仓库验证与用户文档更新，确保该能力可以按仓库现有语言接入标准交付。

## Capabilities

### New Capabilities
- `gdscript-language-support`: 为 CodeGraph 提供第一版 GDScript 语言级索引能力，覆盖 `.gd` 文件识别、语法解析、符号提取、调用提取与脚本路径依赖。

### Modified Capabilities
- None.

## Impact

- 受影响代码主要在 `src/types.ts`、`src/extraction/grammars.ts`、`src/extraction/languages/`、`src/extraction/tree-sitter.ts`、`__tests__/extraction.test.ts`。
- 需要新增 vendored GDScript wasm 语法文件，并确保构建产物会随 `copy-assets` 一起进入 `dist/`。
- 对外能力上会新增 `gdscript` 作为受支持语言，但第一版明确不包含 `.tscn`、`.tres`、signal、scene tree、autoload 或运行时 NodePath 解析。
