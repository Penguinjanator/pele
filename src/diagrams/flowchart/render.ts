import { cnode, compoundLayout, type CEdge, type CNode, type Dir } from '../../layout/compound.js';
import type { Config } from '../../preprocess.js';
import { esc, labelSvg, num, type IconResolver } from '../../svg/builder.js';
import { drawShape, shapeHasLabel, shapeInset, shapeSize } from '../../svg/shapes.js';
import { FONT, RADIUS, ROOT_STYLE, classNames, resolveStyle, type ResolvedStyle } from '../../svg/theme.js';
import { layoutLabel, type Label } from '../../text/label.js';
import { Style, defaultMeasurer, type TextMeasurer } from '../../text/measurer.js';
import { sanitizeUrl } from '../../util/url.js';
import type { FlowDb } from './db.js';
import { buildFlowGraph, type GraphEdge, type GraphNode } from './graph.js';
import { canonicalShape } from './shapes.js';

export interface FlowRenderOptions {
  measurer?: TextMeasurer;
  fontFamily?: string;
  fontSize?: number;
  idPrefix?: string;
  maxWidth?: boolean;
  padding?: number;
  icons?: IconResolver;
}

export interface FlowLink {
  id: string;
  href: string;
  internal: boolean;
}

export interface FlowRenderResult {
  svg: string;
  width: number;
  height: number;
  links: FlowLink[];
}

const NODE_SEP = 40;
const EDGE_SEP = 16;
const RANK_SEP = 48;
const GROUP_PAD = 20;
const LOOP = 26;
const ARROW = 8;
const SHAPE_ATTRS = ' fill="var(--_s)" stroke="var(--_b)"';
const LINE_ATTRS = ' stroke="var(--_b)"';

function direction(dir: string | undefined): Dir {
  return dir === 'BT' || dir === 'LR' || dir === 'RL' ? dir : 'TB';
}

function numberOption(config: Config, key: string, fallback: number): number {
  const value = (config.flowchart as Config | undefined)?.[key];
  return typeof value === 'number' && value > 0 ? value : fallback;
}

interface Path {
  d: string;
  sx: number;
  sy: number;
  sdx: number;
  sdy: number;
  ex: number;
  ey: number;
  edx: number;
  edy: number;
}

// Builds the path for a route of x, y, axis triples, trimming both ends to leave room for markers.
function routePath(route: number[], curve: string | undefined, startTrim: number, endTrim: number): Path {
  const count = route.length / 3;
  const xs = new Array<number>(count);
  const ys = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    xs[i] = route[i * 3];
    ys[i] = route[i * 3 + 1];
  }
  const linear = curve === 'linear';
  const stepped = curve === 'step' || curve === 'stepBefore' || curve === 'stepAfter';
  const straight = (i: number): boolean =>
    linear || Math.abs(xs[i] - xs[i - 1]) < 0.01 || Math.abs(ys[i] - ys[i - 1]) < 0.01;

  const unit = (i: number, j: number, axis: number, bent: boolean): [number, number] => {
    if (bent) return axis === 0 ? [0, Math.sign(ys[j] - ys[i]) || 1] : [Math.sign(xs[j] - xs[i]) || 1, 0];
    const dx = xs[j] - xs[i];
    const dy = ys[j] - ys[i];
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  };
  const last = count - 1;
  const [sdx, sdy] = unit(0, 1, route[5], !straight(1) && !stepped);
  const [edx, edy] = unit(last - 1, last, route[last * 3 + 2], !straight(last) && !stepped);
  const sx = xs[0];
  const sy = ys[0];
  const ex = xs[last];
  const ey = ys[last];
  xs[0] += sdx * startTrim;
  ys[0] += sdy * startTrim;
  xs[last] -= edx * endTrim;
  ys[last] -= edy * endTrim;

  let d = `M${num(xs[0])},${num(ys[0])}`;
  for (let i = 1; i < count; i++) {
    const x = xs[i];
    const y = ys[i];
    const px = xs[i - 1];
    const py = ys[i - 1];
    const axis = route[i * 3 + 2];
    if (straight(i)) {
      d += `L${num(x)},${num(y)}`;
    } else if (stepped) {
      if (axis === 0) {
        const my = curve === 'stepBefore' ? py : curve === 'stepAfter' ? y : (py + y) / 2;
        d += `V${num(my)}H${num(x)}V${num(y)}`;
      } else {
        const mx = curve === 'stepBefore' ? px : curve === 'stepAfter' ? x : (px + x) / 2;
        d += `H${num(mx)}V${num(y)}H${num(x)}`;
      }
    } else if (axis === 0) {
      const my = (py + y) / 2;
      d += `C${num(px)},${num(my)} ${num(x)},${num(my)} ${num(x)},${num(y)}`;
    } else {
      const mx = (px + x) / 2;
      d += `C${num(mx)},${num(py)} ${num(mx)},${num(y)} ${num(x)},${num(y)}`;
    }
  }
  return { d, sx, sy, sdx: -sdx, sdy: -sdy, ex, ey, edx, edy };
}

function markerTrim(type: string): number {
  return type === 'arrow_point' ? ARROW - 1 : type === 'arrow_circle' ? ARROW : type === 'arrow_cross' ? 4 : 0;
}

// Draws a marker whose tip is at (x, y), pointing along (dx, dy).
function marker(type: string, x: number, y: number, dx: number, dy: number, color: string): string {
  const nx = -dy;
  const ny = dx;
  if (type === 'arrow_point') {
    const bx = x - dx * ARROW;
    const by = y - dy * ARROW;
    const half = ARROW * 0.42;
    return `<path class="pele-marker" d="M${num(x)},${num(y)}L${num(bx + nx * half)},${num(by + ny * half)}L${num(
      bx - nx * half
    )},${num(by - ny * half)}Z" fill="${color}" stroke="none"/>`;
  }
  if (type === 'arrow_circle') {
    return `<circle class="pele-marker" cx="${num(x - dx * 4)}" cy="${num(y - dy * 4)}" r="3.5" fill="${color}" stroke="none"/>`;
  }
  if (type === 'arrow_cross') {
    const cx = x - dx * 4;
    const cy = y - dy * 4;
    const a = 3.5;
    const ux = (dx + nx) * a;
    const uy = (dy + ny) * a;
    const vx = (dx - nx) * a;
    const vy = (dy - ny) * a;
    return `<path class="pele-marker" d="M${num(cx - ux)},${num(cy - uy)}L${num(cx + ux)},${num(cy + uy)}M${num(
      cx - vx
    )},${num(cy - vy)}L${num(cx + vx)},${num(cy + vy)}"/>`;
  }
  return '';
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

export function renderFlowchart(db: FlowDb, config: Config, options: FlowRenderOptions): FlowRenderResult {
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
      c.minW = label.width + 2 * GROUP_PAD;
    } else {
      const shape = canonicalShape(node.shape);
      const text = node.img || node.icon || shapeHasLabel(shape) ? node.label : undefined;
      const label = layoutLabel(text, markdown, measurer, fontSize, wrapWidth, textStyle);
      let w: number;
      let h: number;
      let dy = 0;
      if (node.img || node.icon) {
        const box = node.img ? 80 : 48;
        const aw = node.assetWidth ?? box;
        const ah = node.assetHeight ?? box;
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

  const cedges: CEdge[] = [];
  const edgeLabels: Label[] = [];
  const drawn: GraphEdge[] = [];
  for (const edge of graph.edges) {
    const src = index.get(edge.start);
    const dst = index.get(edge.end);
    if (src === undefined || dst === undefined) continue;
    const label = layoutLabel(edge.label, edge.labelType === 'markdown', measurer, edgeSize, wrapWidth);
    if (src === dst) {
      views[src].loops++;
      cnodes[src].w += 2 * (LOOP + (label.width > 0 ? label.width + 12 : 0));
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

  const layout = compoundLayout(cnodes, cedges, direction(db.direction), {
    nodeSep: numberOption(config, 'nodeSpacing', NODE_SEP),
    edgeSep: EDGE_SEP,
    rankSep: numberOption(config, 'rankSpacing', RANK_SEP),
    portSep: 20,
  });

  const width = Math.ceil(layout.width + 2 * pad);
  const height = Math.ceil(layout.height + 2 * pad);
  const links: FlowLink[] = [];
  const prefix = options.idPrefix ?? 'pele';

  let clusters = '';
  let nodesOut = '';
  for (let i = 0; i < views.length; i++) {
    const view = views[i];
    const c = cnodes[i];
    const node = view.node;
    const x = c.x + pad;
    const y = c.y + pad;
    const classes = classNames(node.cssClasses.replace(/^default\s?/, ''));
    const id = esc(node.id);
    if (c.isGroup) {
      clusters +=
        `<g class="pele-cluster${classes}" data-id="${id}">` +
        `<rect x="${num(x - c.w / 2)}" y="${num(y - c.h / 2)}" width="${num(c.w)}" height="${num(c.h)}" rx="${RADIUS}" fill="var(--_a)" fill-opacity="0.5" stroke="var(--_b)"${
          view.style.shape
        }/>` +
        labelSvg(view.label, x, y - c.h / 2 + 8 + view.label.height / 2, ` class="pele-cluster-label" fill="var(--_m)"${view.style.text}`, icons) +
        '</g>';
      continue;
    }

    const w = view.w;
    const h = view.h;
    let inner: string;
    if (node.img) {
      const aw = node.assetWidth ?? 80;
      const ah = node.assetHeight ?? 80;
      const top = view.label.height > 0 ? (node.pos === 't' ? h / 2 - ah : -h / 2) : -ah / 2;
      inner = `<image href="${esc(sanitizeUrl(node.img))}" x="${num(-aw / 2)}" y="${num(top)}" width="${num(
        aw
      )}" height="${num(ah)}" preserveAspectRatio="${node.constraint === 'on' ? 'xMidYMid meet' : 'none'}"/>`;
    } else if (node.icon) {
      const box = node.assetHeight ?? 48;
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
      const target = esc(node.label);
      text = `<a class="internal-link" href="${target}" data-href="${target}">${text}</a>`;
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
      let path: Path;
      if (ce.src === ce.dst) {
        const c = cnodes[ce.src];
        const view = views[ce.src];
        const k = loopSeen.get(ce.src) ?? 0;
        loopSeen.set(ce.src, k + 1);
        const x = c.x + pad + view.w / 2;
        const y = c.y + pad;
        const spread = Math.min(view.h / 2 - 4, 8 + k * 6);
        const reach = LOOP + k * 8;
        const trim = markerTrim(endType);
        const len = Math.hypot(reach, spread) || 1;
        const edx = -reach / len;
        const edy = -spread / len;
        path = {
          d: `M${num(x)},${num(y - spread)}C${num(x + reach)},${num(y - spread * 2)} ${num(x + reach)},${num(
            y + spread * 2
          )} ${num(x - edx * trim)},${num(y + spread - edy * trim)}`,
          sx: x,
          sy: y - spread,
          sdx: -1,
          sdy: 0,
          ex: x,
          ey: y + spread,
          edx,
          edy,
        };
        ce.labelX = c.x + view.w / 2 + reach + 4 + ce.labelW / 2;
        ce.labelY = c.y;
      } else {
        const route = ce.route.slice();
        for (let k = 0; k < route.length; k += 3) {
          route[k] += pad;
          route[k + 1] += pad;
        }
        inset(route, 0, views[ce.src], cnodes[ce.src], pad);
        inset(route, route.length - 3, views[ce.dst], cnodes[ce.dst], pad);
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
      const x = ce.labelX + pad;
      const y = ce.labelY + pad;
      const w = label.width + 8;
      const h = label.height;
      labelsOut +=
        `<g class="pele-edge-label" data-id="${esc(edge.id)}">` +
        `<rect x="${num(x - w / 2)}" y="${num(y - h / 2)}" width="${num(w)}" height="${num(h)}" rx="3" fill="var(--_bg)"/>` +
        labelSvg(label, x, y, style?.text ?? '', icons) +
        '</g>';
    }
  }

  let head = '';
  let aria = '';
  if (db.accTitle) {
    head += `<title id="${esc(prefix)}-title">${esc(db.accTitle)}</title>`;
    aria += ` aria-labelledby="${esc(prefix)}-title"`;
  }
  if (db.accDescr) {
    head += `<desc id="${esc(prefix)}-desc">${esc(db.accDescr)}</desc>`;
    aria += ` aria-describedby="${esc(prefix)}-desc"`;
  }
  const sizeAttrs = options.maxWidth
    ? ` width="100%" style="max-width:${width}px;${ROOT_STYLE}"`
    : ` width="${width}" height="${height}" style="${ROOT_STYLE}"`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" class="pele pele-flowchart" viewBox="0 0 ${width} ${height}"${sizeAttrs} font-family="${FONT}" font-size="${size}" fill="var(--_fg)" role="graphics-document document" aria-roledescription="flowchart"${aria}>` +
    head +
    (clusters ? `<g class="pele-clusters">${clusters}</g>` : '') +
    (edgesOut ? `<g class="pele-edges" fill="none" stroke="var(--_l)" stroke-linecap="round">${edgesOut}</g>` : '') +
    (labelsOut ? `<g class="pele-edge-labels" font-size="${edgeSize}">${labelsOut}</g>` : '') +
    `<g class="pele-nodes">${nodesOut}</g>` +
    '</svg>';

  return { svg, width, height, links };
}

// Moves a route end from the node's bounding box onto its outline.
function inset(route: number[], at: number, view: NodeView, c: CNode, pad: number): void {
  if (c.isGroup) return;
  const x = route[at];
  const y = route[at + 1];
  const cx = c.x + pad;
  const cy = c.y + pad;
  const dx = x - cx;
  const dy = y - cy;
  let side: number;
  if (Math.abs(Math.abs(dy) - view.h / 2) < 0.5) side = dy < 0 ? 0 : 2;
  else if (Math.abs(Math.abs(dx) - c.w / 2) < 0.5) side = dx < 0 ? 3 : 1;
  else return;
  let amount = shapeInset(view.shape, view.w, view.h, side);
  if (side & 1) amount += (c.w - view.w) / 2;
  if (amount === 0) return;
  if (side === 0) route[at + 1] += amount;
  else if (side === 2) route[at + 1] -= amount;
  else if (side === 3) route[at] += amount;
  else route[at] -= amount;
}
