import { PeleError } from '../../errors.js';
import { preprocessBoxDrawing, remapErrorLines } from './boxDrawing.js';
import { parseTreeView, type TreeViewAst } from './parser.js';

export type NodeType = 'file' | 'directory';

export interface TreeNode {
  id: number;
  level: number;
  name: string;
  nodeType: NodeType;
  // An icon name as written (`pack:name`, `file`, `folder`), or `none` to hide the icon.
  icon?: string;
  cssClass?: string;
  description?: string;
  children: TreeNode[];
}

export interface TreeViewModel {
  type: 'treeView';
  title: string | undefined;
  accTitle: string | undefined;
  accDescr: string | undefined;
  // A directory named `/` at level -1 that holds the top-level entries.
  root: TreeNode;
  count: number;
}

// Mermaid's treeView database: nodes arrive in source order with their indentation.
export class TreeViewDb {
  count = 1;
  root: TreeNode = { id: 0, level: -1, name: '/', nodeType: 'directory', children: [] };
  private stack: TreeNode[] = [this.root];

  addNode(level: number, name: string, nodeType: NodeType, cssClass?: string, icon?: string, description?: string): void {
    const stack = this.stack;
    while (level <= stack[stack.length - 1].level) stack.pop();
    const node: TreeNode = { id: this.count++, level, name, nodeType, icon, cssClass, description, children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
}

export function populate(ast: TreeViewAst, db: TreeViewDb): void {
  for (const node of ast.nodes) {
    const level = typeof node.indent === 'number' ? node.indent : 0;
    let name = node.name;
    const isDirectory = name.endsWith('/');
    if (isDirectory) name = name.slice(0, -1);
    const rawIcon = node.iconAnnotation;
    db.addNode(
      level,
      name,
      isDirectory ? 'directory' : 'file',
      node.classAnnotation || undefined,
      rawIcon !== undefined ? rawIcon || 'none' : undefined,
      node.descAnnotation || undefined
    );
  }
}

// Reads the source to a syntax tree, accepting box-drawing input. Errors name lines of the original text.
export function readTreeView(source: string): TreeViewAst {
  const { text, lineMap } = preprocessBoxDrawing(source);
  try {
    return parseTreeView(text);
  } catch (error) {
    if (lineMap.size === 0 || !(error instanceof PeleError)) throw error;
    const head = error.message.indexOf('\n');
    const message =
      head === -1 ? remapErrorLines(error.message, lineMap) : remapErrorLines(error.message.slice(0, head), lineMap) + error.message.slice(head);
    throw new PeleError(message, error.code, {
      type: error.type,
      line: lineMap.get(error.line) ?? error.line,
      column: error.column,
      snippet: error.snippet,
    });
  }
}

export function buildTreeView(ast: TreeViewAst, title: string | undefined): TreeViewModel {
  const db = new TreeViewDb();
  populate(ast, db);
  return {
    type: 'treeView',
    title: ast.title || title,
    accTitle: ast.accTitle ? ast.accTitle.replace(/^\s+/g, '') : undefined,
    accDescr: ast.accDescr ? ast.accDescr.replace(/\n\s+/g, '\n') : undefined,
    root: db.root,
    count: db.count,
  };
}
