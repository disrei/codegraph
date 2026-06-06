import type { Node as SyntaxNode } from 'web-tree-sitter';
import { getNodeText, getChildByField } from '../tree-sitter-helpers';
import type { LanguageExtractor } from '../tree-sitter-types';

type GdscriptCtx = Parameters<NonNullable<LanguageExtractor['visitNode']>>[1];

const GDSCRIPT_BUILTIN_TYPE_NAMES = new Set([
  'void', 'null', 'bool', 'int', 'float', 'String', 'StringName', 'Array', 'Dictionary',
  'Variant', 'Callable', 'Signal', 'NodePath',
]);

function stripStringQuotes(text: string): string {
  return text.replace(/^['"]/, '').replace(/['"]$/, '');
}

function currentScriptClassName(node: SyntaxNode, source: string): string | undefined {
  const root = node.tree.rootNode;
  for (let i = 0; i < root.namedChildCount; i++) {
    const child = root.namedChild(i);
    if (child?.type !== 'class_name_statement') continue;
    const name = getChildByField(child, 'name');
    if (name) return getNodeText(name, source);
  }
  return undefined;
}

function extractResourcePath(callNode: SyntaxNode, source: string): string | null {
  const callee = callNode.namedChild(0);
  if (!callee || callee.type !== 'identifier') return null;
  const name = getNodeText(callee, source);
  if (name !== 'load' && name !== 'preload') return null;

  const args = getChildByField(callNode, 'arguments');
  if (!args) return null;
  for (let i = 0; i < args.namedChildCount; i++) {
    const child = args.namedChild(i);
    if (child?.type === 'string') return stripStringQuotes(getNodeText(child, source).trim());
  }
  return null;
}

function currentScriptClassNode(root: SyntaxNode): SyntaxNode | null {
  for (let i = 0; i < root.namedChildCount; i++) {
    const child = root.namedChild(i);
    if (child?.type === 'class_name_statement') return child;
  }
  return null;
}

function annotationNames(node: SyntaxNode, source: string): string[] {
  const annotations = node.namedChildren.find((child) => child.type === 'annotations');
  if (!annotations) return [];

  const names: string[] = [];
  for (let i = 0; i < annotations.namedChildCount; i++) {
    const child = annotations.namedChild(i);
    if (!child || child.type !== 'annotation') continue;
    const nameNode = child.namedChildren.find((part) => part.type === 'identifier');
    if (!nameNode) continue;
    const name = getNodeText(nameNode, source).trim();
    if (name) names.push(name);
  }
  return names;
}

function hasAnnotation(node: SyntaxNode, source: string, name: string): boolean {
  return annotationNames(node, source).includes(name);
}

function extractTypeName(node: SyntaxNode, source: string): string | null {
  const typeNode = getChildByField(node, 'type');
  if (!typeNode) return null;
  const text = getNodeText(typeNode, source).trim();
  return text || null;
}

function extractTypedParameters(node: SyntaxNode): SyntaxNode[] {
  const params = getChildByField(node, 'parameters');
  if (!params) return [];
  return params.namedChildren.filter((child) => child.type === 'typed_parameter');
}

function buildMemberSignature(node: SyntaxNode, source: string): string | undefined {
  const nameNode = getChildByField(node, 'name');
  const name = nameNode ? getNodeText(nameNode, source).trim() : '';
  const typeName = extractTypeName(node, source);
  const valueNode = getChildByField(node, 'value');
  const initValue = valueNode ? getNodeText(valueNode, source).trim().slice(0, 100) : undefined;
  const initializer = initValue ? ` = ${initValue}${initValue.length >= 100 ? '...' : ''}` : '';

  if (typeName && name) return `${typeName} ${name}${initializer}`;
  if (name) return `${name}${initializer}`;
  return undefined;
}

function addTypeReference(node: SyntaxNode | null | undefined, referenceName: string, ctx: GdscriptCtx, fromNodeId?: string): void {
  if (!node) return;
  const parentId = fromNodeId ?? ctx.nodeStack[ctx.nodeStack.length - 1];
  if (!parentId || !referenceName) return;

  ctx.addUnresolvedReference({
    fromNodeId: parentId,
    referenceName,
    referenceKind: 'references',
    line: node.startPosition.row + 1,
    column: node.startPosition.column,
  });
}

function addInstantiationReference(node: SyntaxNode, referenceName: string, ctx: GdscriptCtx): void {
  const parentId = ctx.nodeStack[ctx.nodeStack.length - 1];
  if (!parentId || !referenceName) return;

  ctx.addUnresolvedReference({
    fromNodeId: parentId,
    referenceName,
    referenceKind: 'instantiates',
    line: node.startPosition.row + 1,
    column: node.startPosition.column,
  });
}

function emitTypeRefsFromTypedParameters(node: SyntaxNode, ctx: GdscriptCtx, fromNodeId?: string): void {
  for (const param of extractTypedParameters(node)) {
    const typeNode = getChildByField(param, 'type');
    if (!typeNode) continue;
    const typeName = getNodeText(typeNode, ctx.source).trim();
    if (!typeName || GDSCRIPT_BUILTIN_TYPE_NAMES.has(typeName)) continue;
    if (typeName) addTypeReference(typeNode, typeName, ctx, fromNodeId);
  }
}

function classReferenceFromAttribute(node: SyntaxNode, source: string): string | null {
  if (node.type !== 'attribute') return null;
  const receiver = node.namedChild(0);
  const call = node.namedChild(1);
  if (!receiver || !call || call.type !== 'attribute_call') return null;

  const nameNode = call.namedChildren.find((child) => child.type === 'identifier');
  if (!nameNode || getNodeText(nameNode, source).trim() !== 'new') return null;
  if (receiver.type !== 'identifier') return null;

  const receiverName = getNodeText(receiver, source).trim();
  return receiverName || null;
}

function addReference(
  node: SyntaxNode | null | undefined,
  referenceName: string,
  referenceKind: 'imports' | 'extends',
  ctx: GdscriptCtx,
  fromNodeId?: string,
): void {
  if (!node) return;
  const parentId = fromNodeId ?? ctx.nodeStack[ctx.nodeStack.length - 1];
  if (!parentId) return;
  ctx.addUnresolvedReference({
    fromNodeId: parentId,
    referenceName,
    referenceKind,
    line: node.startPosition.row + 1,
    column: node.startPosition.column,
  });
}

function emitImportNode(node: SyntaxNode | null | undefined, moduleName: string, source: string, ctx: GdscriptCtx): void {
  if (!node) return;
  ctx.createNode('import', moduleName, node, {
    signature: getNodeText(node, source).trim(),
  });
}

function currentScopeKind(ctx: GdscriptCtx): string | undefined {
  const currentId = ctx.nodeStack[ctx.nodeStack.length - 1];
  return currentId ? ctx.nodes.find((node) => node.id === currentId)?.kind : undefined;
}

function emitScriptMember(node: SyntaxNode, ctx: GdscriptCtx): boolean {
  const source = ctx.source;
  const nameNode = getChildByField(node, 'name');
  if (!nameNode) return true;

  const name = getNodeText(nameNode, source).trim();
  if (!name) return true;

  const decorators = annotationNames(node, source);
  const signature = buildMemberSignature(node, source);
  const nodeKind = node.type === 'const_statement'
    ? 'constant'
    : hasAnnotation(node, source, 'export')
      ? 'property'
      : 'field';
  const created = ctx.createNode(nodeKind, name, nameNode, {
    signature,
    decorators: decorators.length > 0 ? decorators : undefined,
  });

  const ownerId = created?.id;
  const typeName = extractTypeName(node, source);
  if (typeName) addTypeReference(getChildByField(node, 'type') ?? nameNode, typeName, ctx, ownerId);

  const value = getChildByField(node, 'value');
  const resourcePath = value?.type === 'call' ? extractResourcePath(value, source) : null;
  if (value && resourcePath) {
    addReference(value, resourcePath, 'imports', ctx, ownerId);
    emitImportNode(value, resourcePath, source, ctx);
  }

  return true;
}

export const gdscriptExtractor: LanguageExtractor = {
  functionTypes: [],
  classTypes: ['class_name_statement'],
  methodTypes: ['function_definition'],
  methodsAreTopLevel: true,
  interfaceTypes: [],
  structTypes: [],
  enumTypes: ['enum_definition'],
  enumMemberTypes: ['enumerator'],
  typeAliasTypes: [],
  importTypes: [],
  callTypes: ['call'],
  variableTypes: ['variable_statement', 'const_statement'],
  nameField: 'name',
  bodyField: 'body',
  paramsField: 'parameters',
  returnField: 'type',

  getSignature: (node, source) => {
    const params = getChildByField(node, 'parameters');
    return params ? getNodeText(params, source) : undefined;
  },

  getReceiverType: (node, source) => currentScriptClassName(node, source),

  isStatic: (node) => node.namedChildren.some((child) => child.type === 'static_keyword'),

  isConst: (node) => node.type === 'const_statement',

  resolveName: (node, source) => {
    if (node.type === 'enumerator') {
      const left = getChildByField(node, 'left');
      if (left) return getNodeText(left, source);
    }
    return undefined;
  },

  extractImport: (node, source) => {
    if (node.type === 'extends_statement') {
      const str = node.namedChildren.find((child) => child.type === 'string');
      if (str) {
        return {
          moduleName: stripStringQuotes(getNodeText(str, source).trim()),
          signature: getNodeText(node, source).trim(),
        };
      }
    }
    return null;
  },

  visitNode: (node, ctx) => {
    const source = ctx.source;

    if (node.type === 'source') {
      const classDecl = currentScriptClassNode(node);
      if (!classDecl) return false;

      const name = getChildByField(classDecl, 'name');
      const className = name ? getNodeText(name, source) : '';
      const classNode = ctx.createNode('class', className, classDecl, {
        endLine: node.endPosition.row + 1,
        endColumn: node.endPosition.column,
      });
      if (!classNode) return true;

      ctx.pushScope(classNode.id);
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (!child || child.type === 'class_name_statement') continue;
        ctx.visitNode(child);
      }
      ctx.popScope();
      return true;
    }

    if (node.type === 'signal_statement') {
      const nameNode = getChildByField(node, 'name');
      const signalName = nameNode ? getNodeText(nameNode, source).trim() : '';
      if (!signalName) return true;

      const params = getChildByField(node, 'parameters');
      const signature = params ? `signal${getNodeText(params, source)}` : 'signal';
      const signalNode = ctx.createNode('property', signalName, nameNode ?? node, { signature });
      emitTypeRefsFromTypedParameters(node, ctx, signalNode?.id);
      return true;
    }

    if (node.type === 'extends_statement') {
      const info = gdscriptExtractor.extractImport?.(node, source);
      if (info) {
        emitImportNode(node, info.moduleName, source, ctx);
        addReference(node, info.moduleName, 'extends', ctx);
        addReference(node, info.moduleName, 'imports', ctx);
        return true;
      }

      const typeNode = getChildByField(node, 'type') ?? node.namedChildren.find((child) => child.type === 'type');
      const typeName = typeNode ? getNodeText(typeNode, source).trim() : '';
      if (typeNode && typeName) addReference(typeNode, typeName, 'extends', ctx);
      return true;
    }

    if (node.type === 'class_name_statement') {
      return true;
    }

    if (node.type === 'call') {
      const resourcePath = extractResourcePath(node, source);
      if (resourcePath) {
        addReference(node, resourcePath, 'imports', ctx);
        return true;
      }
      return false;
    }

    if (node.type === 'attribute') {
      const className = classReferenceFromAttribute(node, source);
      if (className) {
        addInstantiationReference(node, className, ctx);
        return true;
      }
      return false;
    }

    if (node.type === 'variable_statement' || node.type === 'const_statement') {
      const scopeKind = currentScopeKind(ctx);
      if (scopeKind === 'class') {
        return emitScriptMember(node, ctx);
      }

      const value = getChildByField(node, 'value');
      const typeNode = getChildByField(node, 'type');
      if (scopeKind === 'function' || scopeKind === 'method') {
        const typeName = typeNode ? getNodeText(typeNode, source).trim() : '';
        if (typeNode && typeName) addTypeReference(typeNode, typeName, ctx);
      }

      if (value?.type !== 'call') return false;
      const resourcePath = extractResourcePath(value, source);
      if (!resourcePath) return false;
      addReference(value, resourcePath, 'imports', ctx);
      if (scopeKind === 'function' || scopeKind === 'method') {
        return true;
      }
      emitImportNode(value, resourcePath, source, ctx);
      return false;
    }

    return false;
  },
};
