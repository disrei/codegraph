# Validation Notes

## Local Functional Validation

Completed in this repository:

- Minimal `.gd` + `.tscn` extraction coverage in `__tests__/extraction.test.ts`
- End-to-end indexing validation for a minimal Godot project shape:
  - scene file enters the graph as `file` + scene-level `component`
  - `.tscn -> .gd` script binding resolves through normalized project-relative paths
  - `.gd -> class_name` references and `Foo.new()` instantiation resolve to the target script class
- Same-name file-path regression for `res://...` normalization

Verified commands:

```bash
npx vitest run __tests__/extraction.test.ts -t GDScript
npm run build
```

## Stable Heavy-Validation Commands

Run Godot-related verification sequentially instead of merging it into a broad high-memory Vitest invocation:

```bash
npx vitest run __tests__/extraction.test.ts -t GDScript
npm run build
```

Rationale:

- This repository already documents intermittent Node 24 + Vitest worker-memory instability for heavier mixed runs.
- The Godot change does not require proving stability by forcing extraction, MCP, and unrelated heavy suites into one combined run.
- Sequential commands keep the validation reproducible without turning this change into a test-runner memory project.

## Real-Project Evaluation Status

Current local environment did not initially contain a pre-cloned real Godot repository under `C:\Projects\Github_knowledge`, so a lightweight public sample repository was cloned for spot validation: `C:\Projects\Github_knowledge\godot-samples` (`gertot/godot-samples`).

Observed results on that real repository:

- `.tscn` scene files are indexed and appear in the graph as `godotscene` file records and scene-level `component` nodes.
- The repository's checked scene files do **not** use the exact `script = ExtResource(...)` / `instance = ExtResource(...)` and `class_name` combination needed to fully exercise the complete target chain `scene -> script -> class_name reference`.
- Therefore this real-project run confirms scene-file participation and `.tscn` ingestion on a public Godot repository, but the complete target chain is still primarily covered by the new end-to-end minimal-project regression test in `__tests__/extraction.test.ts`.

Additional real-project validation was then completed on the user's local Godot project `C:\Project_A`:

- `Scenes/Gameplay/Clinic.tscn` produces scene-level `imports` edges to its bound script `Scenes/Gameplay/clinic_manager.gd` and to instanced child scenes such as `Scenes/UI/RollerSelector.tscn`, `Scenes/UI/PrescriptionSlot.tscn`, and `Scenes/UI/DialogueUI.tscn`.
- `Scenes/UI/DialogueUI.tscn` produces scene-level `imports` edges to `Scenes/UI/dialogue_ui.gd` and `Scenes/UI/NotebookUI.tscn`.
- With the current build's GDScript extractor loaded directly, `Scenes/UI/dialogue_ui.gd` emits class-name/type-like references for real project symbols:
  - top-level variable `resource: DialogueResource`
  - top-level variable `current_line: DialogueLine`
  - method parameter `start_dialogue(d_resource: DialogueResource, ...)`
  - method parameter `show_dialogue_line(line: DialogueLine)`
- This demonstrates the target chain is queryable and explainable on a real project in two stages:
  - scene entry point: `.tscn -> bound .gd`
  - script type/class references: `.gd -> class_name / typed symbol`

Note: `C:\Project_A` also exposed a separate CLI/runtime robustness issue where one local-build `codegraph index` invocation reported `0 nodes, 0 edges` despite direct extraction and previously indexed graph data being valid. That behavior does not invalidate the extraction-path verification above, but it should be treated as follow-up work outside this change.

Recommended reproduction flow on a real Godot project that does contain both patterns:

```bash
codegraph init -i
codegraph status --json
```

Then confirm at least these queries against the indexed project:

1. Scene file nodes exist for `.tscn` files.
2. A scene's outgoing `imports` edges point to the bound `.gd` script file.
3. A bound script's methods emit `references` / `instantiates` edges for `class_name` targets used in typed annotations or `Foo.new()`.

## Explicit Second-Stage Boundaries

This second stage still does **not** model:

- `NodePath` resolution
- runtime scene-tree traversal semantics
- autoload/global singleton wiring
- `signal.connect(...)` execution flow
- `$Foo` / `get_node()` runtime target inference

The delivered scope is limited to minimal project-level static structure: `.tscn` resource paths, script bindings, inherited/instanced scene links, and statically visible second-stage GDScript declaration and class-name signals.
