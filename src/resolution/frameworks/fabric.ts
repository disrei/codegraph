/**
 * React Native Fabric / Codegen view components — Phase 6 of the
 * mixed-iOS/RN bridging effort.
 *
 * In the new RN architecture, JS-visible view components are declared via
 * Codegen TS spec files of the shape:
 *
 *   // src/fabric/MyComponentNativeComponent.ts
 *   import { codegenNativeComponent } from 'react-native';
 *   import type { ViewProps, CodegenTypes as CT } from 'react-native';
 *
 *   export interface NativeProps extends ViewProps {
 *     color?: ColorValue;
 *     onTap?: CT.DirectEventHandler<TapEvent>;
 *   }
 *
 *   export default codegenNativeComponent<NativeProps>('MyComponent');
 *
 * Codegen then generates a native ComponentDescriptor that wires the JS
 * component name to a native implementation class — by RN convention,
 * one of `MyComponent`, `MyComponentView`, `MyComponentComponentView`,
 * `MyComponentManager`, `MyComponentViewManager`. The actual implementation
 * lives in ObjC++ (.mm) on iOS or Kotlin/Java on Android.
 *
 * Without bridging, JSX `<MyComponent color="red"/>` in a consumer app has
 * nothing in the graph to land on — the JS-visible name `MyComponent` isn't
 * a node anywhere (only `MyComponentView` is, in the .mm), and the JSX
 * synthesizer matches strictly by name.
 *
 * What this extractor does:
 *   1. Parse the spec file's `codegenNativeComponent<Props>('Name', ...)`
 *      literal — emit a `component` node named `Name`, attributed to the
 *      spec file.
 *   2. Parse the `NativeProps` interface and emit one `property` node per
 *      prop, attributed to the spec file. Props like `onTap` /
 *      `onFinishTransitioning` are JS-callable event-handler bindings;
 *      surfacing them as nodes lets the agent discover the JS surface of
 *      the component.
 *
 * A companion synthesizer (`fabricNativeImplEdges` in
 * callback-synthesizer.ts) links the emitted component node to its
 * native implementation class via the convention-based name+suffix
 * lookup — that produces the cross-language hop the JSX synthesizer's
 * `<MyComponent>` edges naturally chain through.
 */
import type { Node } from '../../types';
import {
  FrameworkExtractionResult,
  FrameworkResolver,
} from '../types';

const CODEGEN_DECL_RE =
  /codegenNativeComponent\s*(?:<[^>]+>)?\s*\(\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g;

/**
 * Cheap source-level detector — must contain `codegenNativeComponent` to
 * be worth parsing. The presence of that import is the canonical Fabric
 * spec signal.
 */
function isFabricSpec(source: string): boolean {
  return source.includes('codegenNativeComponent');
}

/**
 * Pull the `NativeProps` interface body out of a Fabric spec source.
 * Returns `null` when the interface isn't declared in the expected shape.
 */
function findNativePropsBody(source: string): string | null {
  // Permissive: `export interface NativeProps [extends X, Y] { … }`.
  const m = source.match(/export\s+interface\s+NativeProps\b[^{]*\{([\s\S]*?)\n\}/);
  return m?.[1] ?? null;
}

/**
 * Parse the NativeProps interface body and return prop names.
 * Each prop is `name?: Type;` or `name: Type;` on its own line.
 * We don't care about types — just the JS-visible name.
 */
function extractPropNames(body: string): string[] {
  const props: string[] = [];
  // Anchor to start-of-line (after optional whitespace), then capture an
  // identifier, then optional `?`, then `:`. Skip lines that look like
  // method declarations (`name(`) — those are TurboModule spec methods,
  // not view props.
  const regex = /^\s*([A-Za-z_][A-Za-z0-9_]*)\??\s*:/gm;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(body)) !== null) {
    const name = m[1]!;
    // Exclude any line that immediately turns into a function-shape (e.g.
    // `onTap?: () => void` is fine — it's a prop, not a method body —
    // but a literal `name(arg: T): R` is a method declaration).
    const after = body.slice(m.index + m[0].length, m.index + m[0].length + 80);
    if (/^\s*\(/.test(after)) continue; // method-shape, skip
    props.push(name);
  }
  return props;
}

function extractFabricNodes(filePath: string, source: string): Node[] {
  if (!isFabricSpec(source)) return [];

  const now = Date.now();
  const nodes: Node[] = [];

  CODEGEN_DECL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CODEGEN_DECL_RE.exec(source)) !== null) {
    const componentName = m[1]!;
    const before = source.slice(0, m.index);
    const startLine = before.split('\n').length;
    const startColumn = before.length - before.lastIndexOf('\n') - 1;

    // The component itself — kind: 'component' so the existing
    // reactJsxChildEdges synthesizer matches `<MyComponent>` JSX tags to
    // it (its name+kind filter is the gate).
    const componentId = `fabric-component:${filePath}:${componentName}:${startLine}`;
    nodes.push({
      id: componentId,
      kind: 'component',
      name: componentName,
      qualifiedName: `${filePath}::${componentName}`,
      filePath,
      // The spec file is .ts or .tsx; use the file's apparent language
      // by extension. Trim to a known Language value.
      language: filePath.endsWith('.tsx') ? 'tsx' : 'typescript',
      startLine,
      endLine: startLine,
      startColumn,
      endColumn: startColumn + 'codegenNativeComponent'.length,
      docstring: `Fabric/Codegen native component '${componentName}'`,
      signature: `codegenNativeComponent<NativeProps>('${componentName}')`,
      isExported: true,
      updatedAt: now,
    });
  }

  // Props from the NativeProps interface. These are not "method" semantic
  // — they're JS-visible bindings the consumer sets via JSX attributes —
  // so use `property` kind. (The JSX synthesizer doesn't currently
  // produce per-attribute edges, but surfacing the prop names as nodes
  // lets `codegraph_search('onFinishTransitioning')` discover them.)
  const body = findNativePropsBody(source);
  if (body) {
    const props = extractPropNames(body);
    for (const propName of props) {
      const propBefore = source.indexOf(propName, source.indexOf(body));
      const propLine =
        propBefore >= 0 ? source.slice(0, propBefore).split('\n').length : 1;
      nodes.push({
        id: `fabric-prop:${filePath}:${propName}:${propLine}`,
        kind: 'property',
        name: propName,
        qualifiedName: `${filePath}::NativeProps.${propName}`,
        filePath,
        language: filePath.endsWith('.tsx') ? 'tsx' : 'typescript',
        startLine: propLine,
        endLine: propLine,
        startColumn: 0,
        endColumn: propName.length,
        docstring: `Fabric NativeProps prop '${propName}'`,
        isExported: true,
        updatedAt: now,
      });
    }
  }

  return nodes;
}

export const fabricViewResolver: FrameworkResolver = {
  name: 'fabric-view',
  languages: ['typescript', 'tsx'],

  detect(context) {
    // Detect on package.json alone: an RN project has the dep. We
    // initially scanned for a `codegenNativeComponent` marker file too,
    // but on big repos (RNScreens has ~1500 source files; fabric specs
    // come alphabetically after FabricExample/ etc., past any reasonable
    // scan budget) the marker check times out and produces false-
    // negatives. Detect lightly, and let the per-file `extract()` decide
    // which files actually have Fabric specs — extract() is essentially
    // free on non-spec files (a short `includes('codegenNativeComponent')`).
    const pkg = context.readFile('package.json');
    return pkg ? /["']react-native["']\s*:/.test(pkg) : false;
  },

  extract(filePath, source): FrameworkExtractionResult {
    return {
      nodes: extractFabricNodes(filePath, source),
      references: [],
    };
  },

  resolve() {
    // The companion synthesizer (`fabricNativeImplEdges`) handles
    // cross-language edges; standard name resolution handles
    // <MyComponent> → component-node via the JSX synthesizer.
    return null;
  },
};
