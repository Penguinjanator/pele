import type { Config } from '../../preprocess.js';
import { escText, labelSvg, num } from '../../svg/builder.js';
import { svgDocument } from '../../svg/root.js';
import { drawShape, shapeInset, shapeSize } from '../../svg/shapes.js';
import { classNames, seriesColor } from '../../svg/theme.js';
import { layoutLabel, type Label } from '../../text/label.js';
import { Style, defaultMeasurer } from '../../text/measurer.js';
import type { RenderOptions, Rendered } from '../../types.js';
import { iconSvg } from '../common/icon.js';
import type { MindmapModel, MindmapNode } from './db.js';

// Indexed by Mermaid's node type. A node without delimiters is text on a line, except the root.
const SHAPES = ['', 'rounded', 'rect', 'circle', 'cloud', 'bang', 'hex'];
const ROOT_SHAPE = 'stadium';

const GAP_X = 36;
const GAP_Y = 8;
const BRANCH_GAP_X = 52;
const BRANCH_GAP_Y = 20;
const TEXT_PAD = 6;
const ICON_GAP = 6;

export function renderMindmap(model: MindmapModel, config: Config, options: RenderOptions): Rendered {
  const size = options.fontSize ?? 16;
  const measurer = options.measurer ?? defaultMeasurer(options.fontFamily);
  const pad = options.padding ?? 8;
  const icons = options.icons;
  const maxNodeWidth = (config.mindmap as Config | undefined)?.maxNodeWidth;
  const wrap = typeof maxNodeWidth === 'number' && maxNodeWidth > 0 ? Math.min(maxNodeWidth, 2000) : 200;
  const glyph = size * 1.25;

  const nodes = model.nodes;
  const n = nodes.length;
  const labels = new Array<Label>(n);
  const shapes = new Array<string>(n);
  const w = new Float64Array(n);
  const h = new Float64Array(n);
  const dy = new Float64Array(n);
  // Where links meet the node, measured down from its top: the middle of a shape, the line under plain text.
  const anchor = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    const label = (labels[i] = layoutLabel(node.descr, true, measurer, size, wrap));
    const tw = label.width + (node.icon ? glyph + (label.width > 0 ? ICON_GAP : 0) : 0);
    const th = Math.max(label.height, Math.round(size * 1.5));
    const shape = (shapes[i] = SHAPES[node.type] || (i === 0 ? ROOT_SHAPE : ''));
    if (shape === '') {
      w[i] = tw + 2 * TEXT_PAD;
      h[i] = anchor[i] = th + 6;
      dy[i] = -1;
    } else {
      const s = shapeSize(shape, tw, th);
      w[i] = s.w;
      h[i] = s.h;
      dy[i] = s.dy;
      anchor[i] = s.h / 2;
    }
  }

  // Each subtree takes a band of height `extent`. `rel` is a subtree's offset among its siblings,
  // `own` the node's offset inside its band, and `kids` the offset of its children's bands.
  const extent = new Float64Array(n);
  const rel = new Float64Array(n);
  const own = new Float64Array(n);
  const kids = new Float64Array(n);
  let stacked = 0;

  // Stacks subtrees top to bottom and returns the height at which their parent's anchor belongs.
  const stack = (list: MindmapNode[], from: number, to: number, gap: number): number => {
    let y = 0;
    for (let k = from; k < to; k++) {
      const c = list[k].id;
      rel[c] = y;
      y += extent[c] + gap;
    }
    stacked = y - gap;
    const a = list[from].id;
    const b = list[to - 1].id;
    return (rel[a] + own[a] + anchor[a] + rel[b] + own[b] + anchor[b]) / 2;
  };

  // Nodes are in depth-first order, so going backwards visits children before their parent.
  for (let i = n - 1; i > 0; i--) {
    const children = nodes[i].children;
    if (children.length === 0) {
      extent[i] = h[i];
      continue;
    }
    const top = stack(children, 0, children.length, GAP_Y) - anchor[i];
    const low = Math.min(0, top);
    extent[i] = Math.max(stacked, top + h[i]) - low;
    own[i] = top - low;
    kids[i] = -low;
  }

  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const band = new Float64Array(n);
  const side = new Int8Array(n);
  const parent = new Int32Array(n);

  if (n > 0) {
    // The first branches go right and the rest left, split where the two sides are closest in height.
    const branches = nodes[0].children;
    const count = branches.length;
    let total = 0;
    for (const branch of branches) total += extent[branch.id];
    let split = count;
    let best = Infinity;
    let right = 0;
    for (let k = 1; k < count; k++) {
      right += extent[branches[k - 1].id];
      const diff = Math.abs(2 * right - total + (2 * k - count) * BRANCH_GAP_Y);
      if (diff <= best) {
        best = diff;
        split = k;
      }
    }
    for (let from = 0, to = split, dir = 1; from < count; from = to, to = count, dir = -1) {
      const middle = stack(branches, from, to, BRANCH_GAP_Y);
      for (let k = from; k < to; k++) {
        const c = branches[k].id;
        band[c] = rel[c] - middle;
        side[c] = dir;
      }
    }
    y[0] = -h[0] / 2;
    for (let i = 0; i < n; i++) {
      if (i > 0) y[i] = band[i] + own[i];
      for (const child of nodes[i].children) {
        const c = child.id;
        parent[c] = i;
        if (i > 0) {
          side[c] = side[i];
          band[c] = band[i] + kids[i] + rel[c];
        }
        x[c] = x[i] + side[c] * (w[i] / 2 + (i > 0 ? GAP_X : BRANCH_GAP_X) + w[c] / 2);
      }
    }
  }

  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  let out = '';
  let edges = '';
  let joints = '';
  let body = '';
  let color = '';
  const flush = (section: number | undefined): void => {
    if (body === '') return;
    out +=
      `<g class="pele-branch pele-section-${section ?? 0}">` +
      `<g class="pele-edges" fill="none" stroke="${color}" stroke-width="1.5">${edges}${joints}</g>${body}</g>`;
    edges = joints = body = '';
  };

  // The root is drawn last, on top of the links that leave it.
  for (let k = 1; k <= n; k++) {
    const i = k % n;
    const node = nodes[i];
    const shape = shapes[i];
    const label = labels[i];
    const cx = x[i];
    const top = y[i];
    minX = Math.min(minX, cx - w[i] / 2);
    maxX = Math.max(maxX, cx + w[i] / 2);
    minY = Math.min(minY, top);
    maxY = Math.max(maxY, top + h[i]);

    if (i === 0 || parent[i] === 0) flush(nodes[k - 1].section);
    if (i > 0) {
      if (parent[i] === 0) color = seriesColor(node.section ?? 0);
      const p = parent[i];
      const dir = side[i];
      const from = dir > 0 ? 1 : 3;
      const x1 = x[p] + dir * (w[p] / 2 - (shapes[p] ? shapeInset(shapes[p], w[p], h[p], from) : 0));
      const y1 = y[p] + anchor[p];
      const near = cx - (dir * w[i]) / 2;
      const x2 = near + (shape ? dir * shapeInset(shape, w[i], h[i], 4 - from) : 0);
      const y2 = top + anchor[i];
      const mid = num((x1 + x2) / 2);
      edges +=
        `<path class="pele-edge" d="M${num(x1)},${num(y1)}C${mid},${num(y1)} ${mid},${num(y2)} ${num(x2)},${num(y2)}` +
        (shape ? '' : `H${num(cx + (dir * w[i]) / 2)}`) +
        '"/>';
      // A dot where a text node's children leave its line shows where one node ends and the next begins.
      if (!shape && node.children.length > 0) {
        joints += `<circle class="pele-marker" cx="${num(cx + (dir * w[i]) / 2)}" cy="${num(y2)}" r="2.5" fill="var(--_bg)"/>`;
      }
    }

    const stroke = i > 0 ? color : 'var(--_b)';
    let inner = shape ? drawShape(shape, w[i], h[i], ` fill="var(--_s)" stroke="${stroke}"`, ` stroke="${stroke}"`) : '';
    let shift = 0;
    if (node.icon) {
      shift = (glyph + (label.width > 0 ? ICON_GAP : 0)) / 2;
      inner += iconSvg(node.icon, -shift - label.width / 2, dy[i] - glyph / 2, glyph, icons);
    }
    const group =
      `<g class="pele-node pele-shape-${shape || 'text'}${i > 0 ? '' : ' pele-root'}${classNames(node.class ?? '')}" data-id="${escText(
        node.nodeId
      )}" transform="translate(${num(cx)},${num(top + h[i] / 2)})">` +
      inner +
      labelSvg(label, shift, dy[i], ' class="pele-label"', icons) +
      '</g>';
    if (i > 0) body += group;
    else out += group;
  }

  const title = layoutLabel(model.title, false, measurer, size, 4000, Style.Bold);
  const titleHeight = title.height > 0 ? title.height + 16 : 0;
  const width = Math.max(maxX - minX, title.width);
  const totalWidth = Math.ceil(width + 2 * pad);
  const totalHeight = Math.ceil(maxY - minY + titleHeight + 2 * pad);
  const content =
    labelSvg(title, totalWidth / 2, pad + title.height / 2, ' class="pele-title" font-weight="bold"') +
    `<g transform="translate(${num(pad - minX + (width - maxX + minX) / 2)},${num(pad + titleHeight - minY)})">${out}</g>`;

  return {
    svg: svgDocument('mindmap', totalWidth, totalHeight, size, options, {}, content),
    width: totalWidth,
    height: totalHeight,
    links: [],
  };
}
