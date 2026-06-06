## MODIFIED Requirements

### Requirement: First-version GDScript symbols and calls are extracted
The system SHALL extract first-version GDScript symbols and call relationships from `.gd` files, including `class_name`, `func`, `var`, `const`, `enum`, ordinary function or method calls, and second-stage Godot script declarations that are statically visible from source.

#### Scenario: Extract signal and Godot script declaration metadata
- **WHEN** a `.gd` file declares `signal`, `static func`, `@export`, `@onready`, or other statically visible Godot script declarations supported by the second stage
- **THEN** the index preserves those declarations or their relevant metadata using existing graph structures where possible
- **AND** the extracted result remains attributable to the enclosing file or symbol scope

#### Scenario: Preserve script class span for class_name-based scripts
- **WHEN** a `.gd` file declares `class_name` and later defines methods, variables, or enums in the same script
- **THEN** the extracted class node spans the script body strongly enough for range-based containment and context logic to treat those later declarations as belonging to the script class

### Requirement: First-version GDScript path dependencies are extracted conservatively
The system SHALL extract conservative script-level dependency signals for static `load()`, `preload()`, script-path `extends`, and second-stage script-class reference forms without attempting to model broader Godot runtime behavior.

#### Scenario: Extract static class_name-based script reference
- **WHEN** a `.gd` file statically references another script class through a `class_name`-based form supported by the second stage
- **THEN** the index records a type-like, class-like, or dependency-like reference that can be attributed to the enclosing file or symbol scope

#### Scenario: Keep method-body load dependencies as references rather than nested import symbols
- **WHEN** a GDScript method body uses `load()` or `preload()` with a static string literal
- **THEN** the index records the dependency/reference for that script path
- **AND** the extraction does not invent a method-scoped import symbol whose qualified name implies a declared nested symbol
