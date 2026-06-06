import type { Node as SyntaxNode } from 'web-tree-sitter';
import { getNodeText, getChildByField } from '../tree-sitter-helpers';
import type { LanguageExtractor } from '../tree-sitter-types';

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

function addReference(
  node: SyntaxNode,
  referenceName: string,
  referenceKind: 'imports' | 'extends',
  ctx: Parameters<NonNullable<LanguageExtractor['visitNode']>>[1],
  fromNodeId?: string,
): void {
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

function emitImportNode(node: SyntaxNode, moduleName: string, source: string, ctx: Parameters<NonNullable<LanguageExtractor['visitNode']>>[1]): void {
  ctx.createNode('import', moduleName, node, {
    signature: getNodeText(node, source).trim(),
  });
}

function currentScopeKind(ctx: Parameters<NonNullable<LanguageExtractor['visitNode']>>[1]): string | undefined {
  const currentId = ctx.nodeStack[ctx.nodeStack.length - 1];
  return currentId ? ctx.nodes.find((node) => node.id === currentId)?.kind : undefined;
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

  getSignature: (node, source) => {
    const params = getChildByField(node, 'parameters');
    return params ? getNodeText(params, source) : undefined;
  },

  getReceiverType: (node, source) => currentScriptClassName(node, source),

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
    const root = node.tree.rootNode;

    if (node.type === 'extends_statement') {
      const info = gdscriptExtractor.extractImport?.(node, source);
      if (!info) return true;
      const classDecl = currentScriptClassNode(root);
      if (classDecl && classDecl !== node) {
        return true;
      }
      emitImportNode(node, info.moduleName, source, ctx);
      addReference(node, info.moduleName, 'extends', ctx);
      addReference(node, info.moduleName, 'imports', ctx);
      return true;
    }

    if (node.type === 'class_name_statement') {
      const name = getChildByField(node, 'name');
      const className = name ? getNodeText(name, source) : '';
      const classNode = ctx.createNode('class', className, node, {
        endLine: root.endPosition.row + 1,
        endColumn: root.endPosition.column,
      });
      if (!classNode) return true;

      for (let i = 0; i < root.namedChildCount; i++) {
        const child = root.namedChild(i);
        if (child?.type !== 'extends_statement') continue;
        const info = gdscriptExtractor.extractImport?.(child, source);
        if (!info) continue;
        emitImportNode(child, info.moduleName, source, ctx);
        addReference(child, info.moduleName, 'extends', ctx, classNode.id);
        addReference(child, info.moduleName, 'imports', ctx, classNode.id);
      }
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

    if (node.type === 'variable_statement' || node.type === 'const_statement') {
      const value = getChildByField(node, 'value');
      if (value?.type !== 'call') return false;
      const resourcePath = extractResourcePath(value, source);
      if (!resourcePath) return false;
      addReference(value, resourcePath, 'imports', ctx);
      const scopeKind = currentScopeKind(ctx);
      if (scopeKind === 'function' || scopeKind === 'method') {
        return true;
      }
      emitImportNode(value, resourcePath, source, ctx);
      return false;
    }

    return false;
  },
};
