## ADDED Requirements

### Requirement: Godot scene files expose minimal static project links
The system SHALL extract minimal static project-structure links from Godot `.tscn` files so scene files can participate in project-level navigation without requiring full Godot runtime semantics.

#### Scenario: Extract script binding from a scene node
- **WHEN** a `.tscn` scene binds a node to a script resource through a statically declared external resource
- **THEN** the index records a scene-to-script dependency/reference for that `.gd` path
- **AND** the relationship is attributable to the scene file or scene-level symbol scope

#### Scenario: Extract scene inheritance or nested-scene dependency
- **WHEN** a `.tscn` file statically references another scene as its inherited base or instanced scene resource
- **THEN** the index records a scene-to-scene dependency/reference for that `.tscn` path

#### Scenario: Ignore unsupported dynamic or runtime-only scene semantics
- **WHEN** a scene relationship depends on runtime behavior that is not explicit in the `.tscn` file contents
- **THEN** the system does not invent a relationship target
- **AND** extraction completes without failing the file

### Requirement: Godot scene files surface static external resource paths conservatively
The system SHALL conservatively record statically declared external resource paths from `.tscn` files when those paths are explicit in the serialized scene file.

#### Scenario: Extract external resource path from a scene file
- **WHEN** a `.tscn` file declares an external resource with a static `path="res://..."`
- **THEN** the index records an import-like or dependency-like reference for that resource path
- **AND** the reference is emitted without requiring a full scene graph reconstruction

#### Scenario: Exclude non-static resource targets
- **WHEN** a scene resource target cannot be determined from the serialized file contents alone
- **THEN** the system omits that dependency instead of guessing
