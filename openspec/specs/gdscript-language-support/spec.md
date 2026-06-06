## ADDED Requirements

### Requirement: GDScript files are recognized as first-class source files
The system SHALL recognize `.gd` files as `gdscript`, include them in default indexing, and treat them as supported source files during project scans.

#### Scenario: Detect `.gd` during indexing
- **WHEN** a project contains one or more `.gd` files and indexing scans the filesystem
- **THEN** the scanner includes those files in the candidate set
- **AND** language detection classifies each `.gd` file as `gdscript`

#### Scenario: Report GDScript as supported
- **WHEN** tooling queries the set of supported languages or grammar-backed source types
- **THEN** `gdscript` is included in the supported language surface

### Requirement: GDScript files are parsed through a vendored grammar
The system SHALL load GDScript parsing support from a vendored wasm grammar under the repository's shipped extraction assets rather than depending on `tree-sitter-wasms` to provide GDScript.

#### Scenario: Load GDScript grammar from shipped assets
- **WHEN** a project being indexed contains GDScript files
- **THEN** grammar initialization loads the GDScript wasm from the repository-managed wasm asset path
- **AND** parsing does not require a runtime fetch from an external grammar registry

#### Scenario: Build output includes GDScript grammar asset
- **WHEN** the project is built for distribution
- **THEN** the GDScript wasm asset is copied into the shipped extraction wasm directory
- **AND** the runtime can resolve the same asset from `dist/`

### Requirement: First-version GDScript symbols and calls are extracted
The system SHALL extract first-version GDScript symbols and call relationships from `.gd` files, including `class_name`, `func`, `var`, `const`, `enum`, and ordinary function or method calls.

#### Scenario: Extract class and function symbols
- **WHEN** a `.gd` file defines `class_name` and one or more `func` declarations
- **THEN** the index contains corresponding class and function or method nodes
- **AND** the extracted nodes retain source locations and qualified names consistent with existing language integrations

#### Scenario: Extract variables, constants, and enums
- **WHEN** a `.gd` file declares `var`, `const`, or `enum`
- **THEN** the index contains variable, constant, or enum nodes for those declarations
- **AND** enum members are preserved when the grammar exposes them as distinct named entries

#### Scenario: Extract ordinary calls from function bodies
- **WHEN** a GDScript function body invokes another function or method using standard call syntax
- **THEN** the extraction pipeline records unresolved call references and/or call edges using the same call model applied to other supported languages

### Requirement: First-version GDScript path dependencies are extracted conservatively
The system SHALL extract conservative script-level dependency signals for static `load()`, `preload()`, and script-path `extends` forms without attempting to model broader Godot runtime behavior.

#### Scenario: Extract dependency from preload or load
- **WHEN** a `.gd` file uses `preload("res://path/to/file.gd")` or `load("res://path/to/file.gd")` with a static string literal
- **THEN** the index records a dependency/import-like reference for that script path
- **AND** the extracted dependency is attributable to the enclosing file or symbol scope

#### Scenario: Extract dependency from script-path extends
- **WHEN** a `.gd` file uses an `extends` form that names another script by path
- **THEN** the index records the inheritance or dependency relationship for that referenced script path

#### Scenario: Ignore dynamic path expressions
- **WHEN** `load()`, `preload()`, or `extends` uses a dynamic expression that cannot be resolved statically
- **THEN** the system does not invent a dependency target
- **AND** extraction completes without failing the file

### Requirement: First-version support does not require scene-level Godot semantics
The system SHALL consider first-version GDScript support complete without requiring `.tscn`, `.tres`, signal wiring, scene tree traversal, autoload resolution, or NodePath analysis.

#### Scenario: Index pure-script project successfully
- **WHEN** a project contains only `.gd` files and no scene or resource files
- **THEN** indexing still succeeds and produces useful GDScript graph data

#### Scenario: Ignore unsupported Godot runtime semantics
- **WHEN** a `.gd` file relies on scene nodes, signals, autoloads, or runtime NodePath lookups
- **THEN** the first-version extractor may omit those runtime-specific relationships
- **AND** the absence of those relationships does not block GDScript language support from being considered valid
