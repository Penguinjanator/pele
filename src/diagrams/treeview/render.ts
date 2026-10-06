import type { Config } from '../../preprocess.js';
import { esc, labelSvg, num } from '../../svg/builder.js';
import { svgDocument } from '../../svg/root.js';
import { RADIUS, classNames } from '../../svg/theme.js';
import { decodeEntities } from '../../text/entities.js';
import { layoutLabel } from '../../text/label.js';
import { Style, defaultMeasurer } from '../../text/measurer.js';
import type { RenderOptions, Rendered } from '../../types.js';
import { BUILTIN_PACK, GLYPHS, getNodeIcon, iconConfig } from './icons.js';
import type { TreeNode, TreeViewModel } from './model.js';

const ICON_GAP = 6;
const DESC_GAP = 16;
const GUIDE_INSET = 7;
const ELBOW = 4;
const HIGHLIGHT_OVERHANG = 4;

function setting(config: Config, key: string, fallback: number, min: number, max: number): number {
  const value = (config.treeView as Config | undefined)?.[key];
  return typeof value === 'number' && value >= min && value <= max ? value : fallback;
}

// Mermaid's layout options, with Pele's defaults.
export function treeSettings(config: Config): { paddingX: number; paddingY: number; rowIndent: number; lineThickness: number } {
  return {
    paddingX: setting(config, 'paddingX', 5, 0, 100),
    paddingY: setting(config, 'paddingY', 2, 0, 100),
    rowIndent: setting(config, 'rowIndent', 15, 0, 400),
    lineThickness: setting(config, 'lineThickness', 1, 0.25, 12),
  };
}

interface Row {
  node: TreeNode;
  x: number;
  cy: number;
  icon: string | undefined;
  text: string;
  labelX: number;
  highlighted: boolean;
}

export function renderTreeView(model: TreeViewModel, config: Config, options: RenderOptions): Rendered {
  const size = options.fontSize ?? 16;
  const measurer = options.measurer ?? defaultMeasurer(options.fontFamily);
  const pad = options.padding ?? 8;
  const icons = iconConfig(config);

  const { paddingX, paddingY, rowIndent, lineThickness } = treeSettings(config);
  const step = rowIndent + paddingX;
  const rowHeight = Math.round(size * 1.5) + 2 * paddingY;
  const iconSize = size;

  const title = layoutLabel(model.title, false, measurer, size, 4000, Style.Bold);
  const titleHeight = title.height > 0 ? title.height + 12 : 0;

  // Siblings line up: when one entry of a folder has an icon, the others leave room for one.
  const hasIcon = (list: TreeNode[]): boolean => list.some((child) => getNodeIcon(child, icons) !== undefined);
  const rows: Row[] = [];
  const rowOf = new Map<TreeNode, Row>();
  const pending: [TreeNode, number, boolean][] = [];
  const push = (list: TreeNode[], depth: number): void => {
    const slot = hasIcon(list);
    for (let i = list.length - 1; i >= 0; i--) pending.push([list[i], depth, slot]);
  };
  push(model.root.children, 0);
  let labelRight = 0;
  let anyHighlight = false;
  while (pending.length > 0) {
    const [node, depth, slot] = pending.pop()!;
    const x = depth * step;
    const text = decodeEntities(node.name);
    const labelX = x + (slot ? iconSize + ICON_GAP : 0);
    const width = measurer.width(text, size, node.nodeType === 'directory' ? Style.Bold : 0);
    if (labelX + width > labelRight) labelRight = labelX + width;
    const highlighted = node.cssClass !== undefined && node.cssClass.split(/\s+/).includes('highlight');
    if (highlighted) anyHighlight = true;
    const row: Row = { node, x, cy: rows.length * rowHeight + rowHeight / 2, icon: getNodeIcon(node, icons), text, labelX, highlighted };
    rows.push(row);
    rowOf.set(node, row);
    push(node.children, depth + 1);
  }

  const descX = labelRight + DESC_GAP;
  let width = labelRight;
  for (const row of rows) {
    const description = row.node.description;
    if (!description) continue;
    const w = measurer.width(decodeEntities(description), size, Style.Italic);
    if (descX + w > width) width = descX + w;
  }
  width = Math.max(width, title.width);
  const inset = pad + (anyHighlight ? HIGHLIGHT_OVERHANG : 0);
  const top = pad + titleHeight;
  const totalWidth = Math.ceil(width + 2 * inset);
  const totalHeight = Math.ceil(top + rows.length * rowHeight + pad);

  let guides = '';
  for (const row of rows) {
    const children = row.node.children;
    if (children.length === 0) continue;
    const gx = inset + row.x + GUIDE_INSET;
    const tick = Math.max(gx, inset + row.x + step - paddingX);
    const last = top + rowOf.get(children[children.length - 1])!.cy;
    const r = Math.min(ELBOW, tick - gx);
    let d = `M${num(gx)},${num(top + row.cy + rowHeight / 2 - 2)}V${num(last - r)}`;
    if (r > 0) d += `Q${num(gx)},${num(last)} ${num(gx + r)},${num(last)}H${num(tick)}`;
    for (let i = 0; i < children.length - 1 && tick > gx; i++) {
      d += `M${num(gx)},${num(top + rowOf.get(children[i])!.cy)}H${num(tick)}`;
    }
    guides += `<path d="${d}"/>`;
  }

  const baseline = size * 0.35;
  let body = '';
  for (const row of rows) {
    const node = row.node;
    const cy = top + row.cy;
    const directory = node.nodeType === 'directory';
    let inner = '';
    if (row.highlighted) {
      const x = inset + row.x - HIGHLIGHT_OVERHANG;
      inner += `<rect class="pele-tree-highlight" x="${num(x)}" y="${num(cy - rowHeight / 2 + 1)}" width="${num(
        totalWidth - inset + HIGHLIGHT_OVERHANG - x
      )}" height="${num(rowHeight - 2)}" rx="${RADIUS}" fill="var(--_c)" fill-opacity="0.14"/>`;
    }
    if (row.icon !== undefined) {
      const name = row.icon.startsWith(BUILTIN_PACK + ':') ? row.icon.slice(BUILTIN_PACK.length + 1) : '';
      const glyph = GLYPHS.get(name) ?? GLYPHS.get(directory ? 'folder' : 'file')!;
      const drawn = options.icons?.(row.icon) ?? `<path d="${glyph}" stroke="var(--_m)" stroke-width="1.5"/>`;
      inner += `<svg class="pele-icon" data-icon="${esc(row.icon)}" x="${num(inset + row.x)}" y="${num(
        cy - iconSize / 2
      )}" width="${num(iconSize)}" height="${num(
        iconSize
      )}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${drawn}</svg>`;
    }
    if (row.text !== '') {
      inner += `<text class="pele-label" x="${num(inset + row.labelX)}" y="${num(cy + baseline)}"${
        directory ? ' font-weight="bold"' : ''
      } xml:space="preserve">${esc(row.text)}</text>`;
    }
    if (node.description) {
      inner += `<text class="pele-tree-description" x="${num(inset + descX)}" y="${num(
        cy + baseline
      )}" font-style="italic" fill="var(--_m)" xml:space="preserve">${esc(decodeEntities(node.description))}</text>`;
    }
    body += `<g class="pele-node pele-tree-${directory ? 'dir' : 'file'}${classNames(node.cssClass ?? '')}" data-id="${esc(
      node.name
    )}">${inner}</g>`;
  }

  const content =
    labelSvg(title, totalWidth / 2, pad + title.height / 2, ' class="pele-title" font-weight="bold"') +
    (guides ? `<g class="pele-tree-guides" fill="none" stroke="var(--_b)" stroke-width="${num(lineThickness)}">${guides}</g>` : '') +
    body;

  return {
    svg: svgDocument('treeView', totalWidth, totalHeight, size, options, model, content),
    width: totalWidth,
    height: totalHeight,
    links: [],
  };
}
