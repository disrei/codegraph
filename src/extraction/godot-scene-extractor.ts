import * as path from 'path';
import { Edge, ExtractionError, ExtractionResult, Node, UnresolvedReference } from '../types';
import { generateNodeId } from './tree-sitter-helpers';

type ExtResource = {
  id: string;
  type: string | null;
  resourcePath: string;
  resolvedPath: string;
  line: number;
};

export class GodotSceneExtractor {
  private filePath: string;
  private source: string;
  private nodes: Node[] = [];
  private edges: Edge[] = [];
  private unresolvedReferences: UnresolvedReference[] = [];
  private errors: ExtractionError[] = [];

  constructor(filePath: string, source: string) {
    this.filePath = filePath;
    this.source = source;
  }

  extract(): ExtractionResult {
    const startTime = Date.now();

    try {
      const fileNode = this.createFileNode();
      const sceneNode = this.createSceneNode(fileNode.id);
      const ownerId = sceneNode?.id ?? fileNode.id;

      const resources = this.collectExtResources(ownerId);
      this.extractSceneLinks(ownerId, resources);
    } catch (error) {
      this.errors.push({
        message: `Godot scene extraction error: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'error',
        code: 'parse_error',
      });
    }

    return {
      nodes: this.nodes,
      edges: this.edges,
      unresolvedReferences: this.unresolvedReferences,
      errors: this.errors,
      durationMs: Date.now() - startTime,
    };
  }

  private createFileNode(): Node {
    const lines = this.source.split('\n');
    const id = generateNodeId(this.filePath, 'file', this.filePath, 1);
    const node: Node = {
      id,
      kind: 'file',
      name: path.basename(this.filePath),
      qualifiedName: this.filePath,
      filePath: this.filePath,
      language: 'godotscene',
      startLine: 1,
      endLine: lines.length || 1,
      startColumn: 0,
      endColumn: lines[lines.length - 1]?.length ?? 0,
      updatedAt: Date.now(),
    };
    this.nodes.push(node);
    return node;
  }

  private createSceneNode(fileNodeId: string): Node | null {
    const lines = this.source.split('\n');
    const sceneName = path.basename(this.filePath, path.extname(this.filePath));
    const sceneNode = {
      id: generateNodeId(this.filePath, 'component', sceneName, 1),
      kind: 'component' as const,
      name: sceneName,
      qualifiedName: this.filePath,
      filePath: this.filePath,
      language: 'godotscene' as const,
      startLine: 1,
      endLine: lines.length || 1,
      startColumn: 0,
      endColumn: lines[lines.length - 1]?.length ?? 0,
      signature: '[gd_scene]',
      updatedAt: Date.now(),
    };
    this.nodes.push(sceneNode);
    this.edges.push({ source: fileNodeId, target: sceneNode.id, kind: 'contains' });
    return sceneNode;
  }

  private collectExtResources(ownerId: string): Map<string, ExtResource> {
    const resources = new Map<string, ExtResource>();
    const extResourceRegex = /^\s*\[ext_resource\b([^\]]*)\]\s*$/gm;
    let match: RegExpExecArray | null;

    while ((match = extResourceRegex.exec(this.source)) !== null) {
      const attrs = match[1] ?? '';
      const id = this.extractAttr(attrs, 'id');
      const resourcePath = this.extractAttr(attrs, 'path');
      if (!id || !resourcePath) continue;

      const resource: ExtResource = {
        id,
        type: this.extractAttr(attrs, 'type'),
        resourcePath,
        resolvedPath: this.normalizeResourcePath(resourcePath),
        line: this.getLineNumber(match.index),
      };
      resources.set(id, resource);
      this.addUnresolvedReference(ownerId, resource.resolvedPath, 'references', resource.line);
    }

    return resources;
  }

  private extractSceneLinks(ownerId: string, resources: Map<string, ExtResource>): void {
    const lines = this.source.split('\n');
    const extRefCall = /ExtResource\("([^"]+)"\)/;

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]!;
      const lineNumber = index + 1;

      if (/^\s*\[node\b/.test(line)) {
        const scriptId = this.extractInlineExtResourceId(line, /\bscript\s*=\s*ExtResource\("([^"]+)"\)/);
        if (scriptId) this.addImportForExtResource(ownerId, resources.get(scriptId), lineNumber);

        const instanceId = this.extractInlineExtResourceId(line, /\binstance\s*=\s*ExtResource\("([^"]+)"\)/);
        if (instanceId) this.addImportForExtResource(ownerId, resources.get(instanceId), lineNumber);
        continue;
      }

      if (/^\s*\[gd_scene\b/.test(line)) {
        const inheritedId = this.extractInlineExtResourceId(line, /\binherits\s*=\s*ExtResource\("([^"]+)"\)/);
        if (inheritedId) this.addImportForExtResource(ownerId, resources.get(inheritedId), lineNumber);
        continue;
      }

      const scriptAssign = /^\s*script\s*=\s*ExtResource\("([^"]+)"\)\s*$/.exec(line);
      if (scriptAssign) {
        this.addImportForExtResource(ownerId, resources.get(scriptAssign[1]!), lineNumber);
        continue;
      }

      const anyExtRef = extRefCall.exec(line);
      if (!anyExtRef) continue;

      const ref = resources.get(anyExtRef[1]!);
      if (!ref) continue;
      if (ref.resourcePath.endsWith('.gd') || ref.resourcePath.endsWith('.tscn')) {
        this.addImportForExtResource(ownerId, ref, lineNumber);
      }
    }
  }

  private addImportForExtResource(ownerId: string, resource: ExtResource | undefined, line: number): void {
    if (!resource) return;
    this.addUnresolvedReference(ownerId, resource.resolvedPath, 'imports', line);
  }

  private addUnresolvedReference(fromNodeId: string, referenceName: string, referenceKind: 'imports' | 'references', line: number): void {
    this.unresolvedReferences.push({
      fromNodeId,
      referenceName,
      referenceKind,
      line,
      column: 0,
    });
  }

  private extractAttr(attrs: string, name: string): string | null {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`\\b${escaped}\\s*=\\s*"([^"]+)"`).exec(attrs);
    return match?.[1] ?? null;
  }

  private extractInlineExtResourceId(line: string, pattern: RegExp): string | null {
    const match = pattern.exec(line);
    return match?.[1] ?? null;
  }

  private normalizeResourcePath(resourcePath: string): string {
    if (resourcePath.startsWith('res://')) {
      return resourcePath.slice('res://'.length);
    }
    return resourcePath;
  }

  private getLineNumber(offset: number): number {
    let line = 1;
    for (let i = 0; i < offset && i < this.source.length; i++) {
      if (this.source.charCodeAt(i) === 10) line++;
    }
    return line;
  }
}
