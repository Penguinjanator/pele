import { cnode, compoundLayout, type CEdge, type CNode, type Dir } from '../../layout/compound.js';
import type { Config } from '../../preprocess.js';
import { esc, labelSvg, num } from '../../svg/builder.js';
import { marker, markerTrim, routePath, type EdgePath } from '../../svg/edges.js';
import { svgDocument } from '../../svg/root.js';
import { drawShape, shapeHasLabel, shapeInset, shapeSize } from '../../svg/shapes.js';
import { RADIUS, classNames, resolveStyle, type ResolvedStyle } from '../../svg/theme.js';
import { layoutLabel, type Label } from '../../text/label.js';
import { Style, defaultMeasurer } from '../../text/measurer.js';
import { sanitizeUrl } from '../../util/url.js';
import type { LinkInfo, RenderOptions, Rendered } from '../../types.js';
import type { FlowDb } from './db.js';
import { buildFlowGraph, type GraphEdge, type GraphNode } from './graph.js';
import { canonicalShape } from './shapes.js';

const NODE_SEP = 40;
const EDGE_SEP = 16;
const RANK_SEP = 48;
const GROUP_PAD = 20;
const LOOP = 26;
const SHAPE_ATTRS = ' fill="var(--_s)" stroke="var(--_b)"';
const LINE_ATTRS = ' stroke="var(--_b)"';

function direction(dir: string | undefined): Dir {
  return dir === 'BT' || dir === 'LR' || dir === 'RL' ? dir : 'TB';
}

function numberOption(config: Config, key: string, fallback: number): number {
  const value = (config.flowchart as Config | undefined)?.[key];
  return typeof value === 'number' && value > 0 ? Math.min(value, 2000) : fallback;
}

function assetSize(value: number | undefined, fallback: number): number {
  return value !== undefined && value > 0 && value <= 4000 ? value : fallback;
}

interface NodeView {
  node: GraphNode;
  style: ResolvedStyle;
  label: Label;
  shape: string;
  w: number;
  h: number;
  dy: number;
  loops: number;
}

export function renderFlowchart(db: FlowDb, config: Config, options: RenderOptions): Rendered {
  const flow = (config.flowchart ?? {}) as Config;
  const graph = buildFlowGraph(db, typeof flow.curve === 'string' ? flow.curve : undefined);
  const size = options.fontSize ?? 16;
  const edgeSize = Math.round(size * 0.875);
  const measurer = options.measurer ?? defaultMeasurer(options.fontFamily);
  const wrapWidth = numberOption(config, 'wrappingWidth', 200);
  const pad = options.padding ?? 8;
  const icons = options.icons;

  const index = new Map<string, number>();
  const views: NodeView[] = [];
  const cnodes: CNode[] = [];
  graph.nodes.forEach((node, i) => index.set(node.id, i));

  for (const node of graph.nodes) {
    const style = resolveStyle(
      node.cssStyles.length > 0 ? node.cssCompiledStyles.concat(node.cssStyles) : node.cssCompiledStyles
    );
    const textStyle = (style.bold ? Style.Bold : 0) | (style.italic ? Style.Italic : 0);
    const markdown = node.labelType === 'markdown';
    const fontSize = style.fontSize ?? size;
    let view: NodeView;
    let c: CNode;
    if (node.isGroup) {
      const label = layoutLabel(node.label, markdown, measurer, fontSize, 4000, textStyle);
      view = { node, style, label, shape: 'group', w: 0, h: 0, dy: 0, loops: 0 };
      c = cnode(0, 0);
      c.isGroup = true;
      c.dir = node.dir ? direction(node.dir) : undefined;
      c.padX = GROUP_PAD;
      c.padTop = label.height > 0 ? label.height + 16 : GROUP_PAD;
      c.padBottom = GROUP_PAD;
      c.minW = label.width + 2 * GROUP_PAD - 12;
    } else {
      const shape = canonicalShape(node.shape);
      const text = node.img || node.icon || shapeHasLabel(shape) ? node.label : undefined;
      const label = layoutLabel(text, markdown, measurer, fontSize, wrapWidth, textStyle);
      let w: number;
      let h: number;
      let dy = 0;
      if (node.img || node.icon) {
        const box = node.img ? 80 : 48;
        const aw = assetSize(node.assetWidth, box);
        const ah = assetSize(node.assetHeight, box);
        w = Math.max(aw, label.width + 8);
        h = ah + (label.height > 0 ? label.height + 6 : 0);
        dy = node.pos === 't' ? -ah / 2 : ah / 2;
        if (label.height === 0) dy = 0;
      } else {
        const s = shapeSize(shape, label.width, label.height);
        w = s.w;
        h = s.h;
        dy = s.dy;
      }
      view = { node, style, label, shape, w, h, dy, loops: 0 };
      c = cnode(w, h);
    }
    c.seq = views.length;
    views.push(view);
    cnodes.push(c);
  }
  graph.nodes.forEach((node, i) => {
    cnodes[i].parent = node.parentId !== undefined ? (index.get(node.parentId) ?? -1) : -1;
  });

  const rootDir = direction(db.direction);
  const flowsSideways = (i: number): boolean => {
    let dir: Dir | undefined;
    for (let p = cnodes[i].parent, hops = 0; p >= 0 && dir === undefined && hops < 10000; p = cnodes[p].parent, hops++) {
      dir = cnodes[p].dir;
    }
    dir ??= rootDir;
    return dir === 'LR' || dir === 'RL';
  };

  const cedges: CEdge[] = [];
  const edgeLabels: Label[] = [];
  const drawn: GraphEdge[] = [];
  for (const edge of graph.edges) {
    const src = index.get(edge.start);
    const dst = index.get(edge.end);
    if (src === undefined || dst === undefined) continue;
    const label = layoutLabel(edge.label, edge.labelType === 'markdown', measurer, edgeSize, wrapWidth);
    if (src === dst) {
      // A self-loop sits beside the node, across the flow, and the node's box grows to hold it.
      views[src].loops++;
      if (flowsSideways(src)) cnodes[src].h += 2 * (LOOP + (label.height > 0 ? label.height + 8 : 0));
      else cnodes[src].w += 2 * (LOOP + (label.width > 0 ? label.width + 12 : 0));
    }
    drawn.push(edge);
    edgeLabels.push(label);
    cedges.push({
      src,
      dst,
      minlen: edge.minlen ?? 1,
      labelW: label.width > 0 ? label.width + 12 : 0,
      labelH: label.height > 0 ? label.height + 4 : 0,
      route: [],
      labelX: 0,
      labelY: 0,
    });
  }

  const layout = compoundLayout(cnodes, cedges, rootDir, {
    nodeSep: numberOption(config, 'nodeSpacing', NODE_SEP),
    edgeSep: EDGE_SEP,
    rankSep: numberOption(config, 'rankSpacing', RANK_SEP),
    portSep: 20,
  });

  // Move everything once, to make room for the padding and the title.
  const title = layoutLabel(db.title, false, measurer, size, 4000, Style.Bold);
  const titleHeight = title.height > 0 ? title.height + 12 : 0;
  const inner = Math.max(layout.width, title.width);
  const ox = pad + (inner - layout.width) / 2;
  const oy = pad + titleHeight;
  for (const c of cnodes) {
    c.x += ox;
    c.y += oy;
  }
  for (const e of cedges) {
    for (let k = 0; k < e.route.length; k += 3) {
      e.route[k] += ox;
      e.route[k + 1] += oy;
    }
    e.labelX += ox;
    e.labelY += oy;
  }
  const width = Math.ceil(inner + 2 * pad);
  const height = Math.ceil(layout.height + titleHeight + 2 * pad);
  const links: LinkInfo[] = [];

  // Route points by rounded y, to find the edges that cross a cluster's top border.
  const crossings = new Map<number, number[]>();
  let anyGroup = false;
  for (const c of cnodes) if (c.isGroup) anyGroup = true;
  if (anyGroup) {
    for (const e of cedges) {
      const route = e.route;
      for (let k = 0; k < route.length; k += 3) {
        const key = Math.round(route[k + 1]);
        const list = crossings.get(key);
        if (list) list.push(route[k]);
        else crossings.set(key, [route[k]]);
      }
    }
  }

  let clusters = '';
  let nodesOut = '';
  for (let i = 0; i < views.length; i++) {
    const view = views[i];
    const c = cnodes[i];
    const node = view.node;
    const x = c.x;
    const y = c.y;
    const classes = classNames(node.cssClasses.replace(/^default\s?/, ''));
    const id = esc(node.id);
    if (c.isGroup) {
      const titleX = clusterTitleX(c, view.label.width, crossings);
      clusters +=
        `<g class="pele-cluster${classes}" data-id="${id}">` +
        `<rect x="${num(x - c.w / 2)}" y="${num(y - c.h / 2)}" width="${num(c.w)}" height="${num(c.h)}" rx="${RADIUS}" fill="var(--_a)" fill-opacity="0.5" stroke="var(--_b)"${
          view.style.shape
        }/>` +
        labelSvg(view.label, titleX, y - c.h / 2 + 8 + view.label.height / 2, ` class="pele-cluster-label" fill="var(--_m)"${view.style.text}`, icons) +
        '</g>';
      continue;
    }

    const w = view.w;
    const h = view.h;
    let inner: string;
    if (node.img) {
      const aw = assetSize(node.assetWidth, 80);
      const ah = assetSize(node.assetHeight, 80);
      const top = view.label.height > 0 ? (node.pos === 't' ? h / 2 - ah : -h / 2) : -ah / 2;
      inner = `<image href="${esc(sanitizeUrl(node.img))}" x="${num(-aw / 2)}" y="${num(top)}" width="${num(
        aw
      )}" height="${num(ah)}" preserveAspectRatio="${node.constraint === 'on' ? 'xMidYMid meet' : 'none'}"/>`;
    } else if (node.icon) {
      const box = assetSize(node.assetHeight, 48);
      const top = view.label.height > 0 ? (node.pos === 't' ? h / 2 - box : -h / 2) : -box / 2;
      const frame =
        node.shape === 'icon'
          ? ''
          : node.shape === 'iconCircle'
            ? `<circle cy="${num(top + box / 2)}" r="${num(box / 2)}"${SHAPE_ATTRS}${view.style.shape}/>`
            : `<rect x="${num(-box / 2)}" y="${num(top)}" width="${num(box)}" height="${num(box)}" rx="${
                node.shape === 'iconRounded' ? 8 : 0
              }"${SHAPE_ATTRS}${view.style.shape}/>`;
      const glyph = box * 0.6;
      inner =
        frame +
        `<svg class="pele-icon" data-icon="${esc(node.icon)}" x="${num(-glyph / 2)}" y="${num(
          top + (box - glyph) / 2
        )}" width="${num(glyph)}" height="${num(glyph)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${
          icons?.(node.icon) ?? ''
        }</svg>`;
    } else {
      inner = drawShape(view.shape, w, h, SHAPE_ATTRS + view.style.shape, LINE_ATTRS + view.style.line);
    }

    let text = labelSvg(view.label, 0, view.dy, ` class="pele-label"${view.style.text}`, icons);
    const internal = / internal-link(?: |$)/.test(classes + ' ');
    if (internal && node.label) {
      // The label is a note name, but it still ends up in an href, so it gets the same check as a URL.
      const safe = sanitizeUrl(node.label) !== 'about:blank';
      const target = esc(node.label);
      text = `<a class="internal-link"${safe ? ` href="${target}"` : ''} data-href="${target}">${text}</a>`;
      links.push({ id: node.id, href: node.label, internal: true });
    }
    let body = inner + text;
    if (node.tooltip) body = `<title>${esc(node.tooltip)}</title>` + body;
    if (node.link) {
      const target = node.linkTarget ? ` target="${esc(node.linkTarget)}"` : '';
      body = `<a href="${esc(node.link)}"${target} rel="noopener">${body}</a>`;
      links.push({ id: node.id, href: node.link, internal: false });
    }
    nodesOut += `<g class="pele-node pele-shape-${view.shape}${classes}" data-id="${id}" transform="translate(${num(
      x
    )},${num(y)})">${body}</g>`;
  }

  let edgesOut = '';
  let labelsOut = '';
  const loopSeen = new Map<number, number>();
  for (let i = 0; i < cedges.length; i++) {
    const ce = cedges[i];
    const edge = drawn[i];
    const label = edgeLabels[i];
    const style = edge.style.length > 0 || edge.cssCompiledStyles.length > 0 ? resolveStyle(edge.cssCompiledStyles.concat(edge.style)) : undefined;
    if (edge.thickness !== 'invisible') {
      const startType = edge.arrowTypeStart;
      const endType = edge.arrowTypeEnd;
      let path: EdgePath;
      if (ce.src === ce.dst) {
        const c = cnodes[ce.src];
        const view = views[ce.src];
        const k = loopSeen.get(ce.src) ?? 0;
        loopSeen.set(ce.src, k + 1);
        const sideways = flowsSideways(ce.src);
        const half = (sideways ? view.w : view.h) / 2;
        const spread = Math.min(half - 4, 8 + k * 6);
        const reach = LOOP + k * 8;
        const trim = markerTrim(endType);
        const len = Math.hypot(reach, spread) || 1;
        // Local frame: `out` points away from the node, `along` runs along its side.
        const at = (out: number, along: number): string =>
          sideways
            ? `${num(c.x + along)},${num(c.y + view.h / 2 + out)}`
            : `${num(c.x + view.w / 2 + out)},${num(c.y + along)}`;
        const tx = (reach / len) * trim;
        const ty = (spread / len) * trim;
        const ex = sideways ? c.x + spread : c.x + view.w / 2;
        const ey = sideways ? c.y + view.h / 2 : c.y + spread;
        path = {
          d: `M${at(0, -spread)}C${at(reach, -spread * 2)} ${at(reach, spread * 2)} ${at(tx, spread + ty)}`,
          sx: sideways ? c.x - spread : c.x + view.w / 2,
          sy: sideways ? c.y + view.h / 2 : c.y - spread,
          sdx: sideways ? 0 : -1,
          sdy: sideways ? -1 : 0,
          ex,
          ey,
          edx: sideways ? -spread / len : -reach / len,
          edy: sideways ? -reach / len : -spread / len,
        };
        if (sideways) {
          ce.labelX = c.x;
          ce.labelY = c.y + view.h / 2 + reach + 4 + ce.labelH / 2;
        } else {
          ce.labelX = c.x + view.w / 2 + reach + 4 + ce.labelW / 2;
          ce.labelY = c.y;
        }
      } else {
        const route = ce.route.slice();
        inset(route, 0, views[ce.src], cnodes[ce.src]);
        inset(route, route.length - 3, views[ce.dst], cnodes[ce.dst]);
        path = routePath(route, edge.curve, markerTrim(startType), markerTrim(endType));
      }
      const color = style?.stroke && edge.thickness !== 'invisible' ? esc(style.stroke) : 'var(--_l)';
      let attrs = '';
      if (edge.thickness === 'thick') attrs += ' stroke-width="2.5"';
      else if (edge.thickness === 'dotted') attrs += ' stroke-dasharray="3 4"';
      const classes = classNames(edge.classes.replace(/edge-thickness-normal|edge-pattern-solid|flowchart-link/g, ''));
      edgesOut +=
        `<g class="pele-edge${classes}" data-id="${esc(edge.id)}"${style?.line ?? ''}>` +
        `<path d="${path.d}"${attrs}/>` +
        marker(startType, path.sx, path.sy, path.sdx, path.sdy, color) +
        marker(endType, path.ex, path.ey, path.edx, path.edy, color) +
        '</g>';
    }
    if (label.width > 0) {
      const x = ce.labelX;
      const y = ce.labelY;
      const w = label.width + 8;
      const h = label.height;
      labelsOut +=
        `<g class="pele-edge-label" data-id="${esc(edge.id)}">` +
        `<rect x="${num(x - w / 2)}" y="${num(y - h / 2)}" width="${num(w)}" height="${num(h)}" rx="3" fill="var(--_bg)"/>` +
        labelSvg(label, x, y, style?.text ?? '', icons) +
        '</g>';
    }
  }

  const svg = svgDocument(
    'flowchart',
    width,
    height,
    size,
    options,
    db,
    labelSvg(title, width / 2, pad + title.height / 2, ' class="pele-title" font-weight="bold"') +
      (clusters ? `<g class="pele-clusters">${clusters}</g>` : '') +
      (edgesOut ? `<g class="pele-edges" fill="none" stroke="var(--_l)" stroke-linecap="round">${edgesOut}</g>` : '') +
      (labelsOut ? `<g class="pele-edge-labels" font-size="${edgeSize}">${labelsOut}</g>` : '') +
      `<g class="pele-nodes">${nodesOut}</g>`
  );

  return { svg, width, height, links };
}

// Picks where a cluster title sits along the top edge so that edges entering there do not cross it.
function clusterTitleX(c: CNode, width: number, crossings: Map<number, number[]>): number {
  if (width === 0) return c.x;
  const top = c.y - c.h / 2;
  const left = c.x - c.w / 2;
  const half = width / 2;
  const candidates = [left + GROUP_PAD - 6 + half, c.x, left + c.w - GROUP_PAD + 6 - half];
  const xs = crossings.get(Math.round(top));
  if (xs === undefined) return candidates[0];
  let best = candidates[0];
  let bestGap = -1;
  for (const x of candidates) {
    let gap = Infinity;
    for (const cx of xs) if (cx > left && cx < left + c.w) gap = Math.min(gap, Math.abs(cx - x) - half);
    if (gap >= 6) return x;
    if (gap > bestGap + 0.5) {
      bestGap = gap;
      best = x;
    }
  }
  return best;
}

// Moves a route end from the node's layout box onto its outline.
function inset(route: number[], at: number, view: NodeView, c: CNode): void {
  if (c.isGroup) return;
  const dx = route[at] - c.x;
  const dy = route[at + 1] - c.y;
  if (Math.abs(Math.abs(dy) - c.h / 2) < 0.5) {
    const side = dy < 0 ? 0 : 2;
    const amount = shapeInset(view.shape, view.w, view.h, side) + (c.h - view.h) / 2;
    route[at + 1] += side === 0 ? amount : -amount;
  } else if (Math.abs(Math.abs(dx) - c.w / 2) < 0.5) {
    const side = dx < 0 ? 3 : 1;
    const amount = shapeInset(view.shape, view.w, view.h, side) + (c.w - view.w) / 2;
    route[at] += side === 3 ? amount : -amount;
  }
}
