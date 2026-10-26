import { ease } from '../layout/layered.js';
import type { Label } from '../text/label.js';
import type { IconResolver } from '../types.js';
import { escText, labelSvg, num } from './builder.js';
import { ink } from './ink.js';

export const ARROW = 8;

export interface EdgePath {
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

// Marker types are Mermaid's: arrow_point, arrow_circle, arrow_cross; anything else draws nothing.

// The most a corner is rounded by in a stepped route.
const CORNER = 12;
// How far the handles of a wide turn reach along its two legs. A little more than a circle's,
// which makes the turn fuller.
const HANDLE = 0.62;
// How far an edge runs straight before a marker at its end, where it has the room.
export const LEAD = 6;

// How far from each side of each node the edges that meet it start to turn: as far as the
// largest marker there needs, for every edge on the side, so that none turns sooner than its
// neighbour and crosses it. `add` takes a node, the side of it, and the marker of an end there.
export function sideReach(): { add(node: number, side: number, type: string): void; of(node: number, side: number): number } {
  const reach = new Map<number, number>();
  return {
    add(node, side, type) {
      const trim = markerTrim(type);
      if (side >= 0 && trim > 0 && trim + LEAD > (reach.get(node * 4 + side) ?? 0)) reach.set(node * 4 + side, trim + LEAD);
    },
    of: (node, side) => (side >= 0 ? (reach.get(node * 4 + side) ?? 0) : 0),
  };
}

// Builds the path for a route of x, y, axis triples, trimming both ends to leave room for markers.
// Between two points that are not in line, a route is one S that leaves and arrives along the
// flow, or a step in a stepped route. Where the route itself turns a corner, a stepped route
// rounds it a little, and any other but a linear one turns as widely as it can: the turn takes
// the whole of a leg that ends at a node and half of a leg it shares with the next turn.
// `startReach` and `endReach` say how far from its nodes the edge starts to turn, where the
// other edges on the same side of a node need it to; by default, far enough to clear its own marker.
export function routePath(
  route: number[],
  curve: string | undefined,
  startTrim: number,
  endTrim: number,
  startReach = startTrim > 0 ? startTrim + LEAD : 0,
  endReach = endTrim > 0 ? endTrim + LEAD : 0
): EdgePath {
  const linear = curve === 'linear';
  const stepped = curve === 'step' || curve === 'stepBefore' || curve === 'stepAfter';
  const xs: number[] = [];
  const ys: number[] = [];
  const axes: number[] = [];
  const near = (ax: number, ay: number, bx: number, by: number): boolean => Math.abs(ax - bx) < 0.01 && Math.abs(ay - by) < 0.01;
  for (let i = 0; i < route.length; i += 3) {
    const x = route[i];
    const y = route[i + 1];
    const axis = route[i + 2];
    const last = xs.length - 1;
    // A stepped route turns at right angles where a smooth one would curve.
    if (stepped && last >= 0 && Math.abs(x - xs[last]) >= 0.01 && Math.abs(y - ys[last]) >= 0.01) {
      const px = xs[last];
      const py = ys[last];
      const my = curve === 'stepBefore' ? py : curve === 'stepAfter' ? y : (py + y) / 2;
      const mx = curve === 'stepBefore' ? px : curve === 'stepAfter' ? x : (px + x) / 2;
      const turns = axis === 0 ? [px, my, x, my] : [mx, py, mx, y];
      for (let k = 0; k < 4; k += 2) {
        if (near(turns[k], turns[k + 1], px, py) || near(turns[k], turns[k + 1], x, y)) continue;
        xs.push(turns[k]);
        ys.push(turns[k + 1]);
        axes.push(axis);
      }
    }
    xs.push(x);
    ys.push(y);
    axes.push(axis);
  }
  let last = xs.length - 1;
  const aligned = (i: number): boolean => Math.abs(xs[i] - xs[i - 1]) < 0.01 || Math.abs(ys[i] - ys[i - 1]) < 0.01;
  const straight = (i: number): boolean => linear || aligned(i);
  // The way the route heads from point i to point j: along the flow where an S joins them.
  const unit = (i: number, j: number, axis: number): [number, number] => {
    if (!straight(Math.max(i, j))) return axis === 0 ? [0, Math.sign(ys[j] - ys[i]) || 1] : [Math.sign(xs[j] - xs[i]) || 1, 0];
    const dx = xs[j] - xs[i];
    const dy = ys[j] - ys[i];
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  };
  const [sdx, sdy] = unit(0, 1, axes[1]);
  const [edx, edy] = unit(last - 1, last, axes[last]);
  const sx = xs[0];
  const sy = ys[0];
  const ex = xs[last];
  const ey = ys[last];
  xs[0] += sdx * startTrim;
  ys[0] += sdy * startTrim;
  xs[last] -= edx * endTrim;
  ys[last] -= edy * endTrim;
  const length = (i: number): number => Math.abs(xs[i] - xs[i - 1]) + Math.abs(ys[i] - ys[i - 1]);
  // Whether the route turns a corner at point i, from running one way to running the other.
  const turns = (i: number): boolean =>
    !linear && i > 0 && i < last && aligned(i) && aligned(i + 1) && length(i) >= 0.01 && length(i + 1) >= 0.01 && Math.abs(xs[i] - xs[i - 1]) < 0.01 !== Math.abs(xs[i + 1] - xs[i]) < 0.01;
  // An edge that curves into a marker runs straight for a little way first, where it has the
  // room, so that the marker does not sit on the bend.
  const along = (i: number, ux: number, uy: number): number => Math.abs(xs[i] - xs[i - 1]) * Math.abs(ux) + Math.abs(ys[i] - ys[i - 1]) * Math.abs(uy);
  // Of the way from the end of a run to where it turns, the part that makes up for a larger
  // marker beside this one is kept where it can be, and the rest is at most a quarter of what
  // is left, so that ends on one side of a node turn equally far from it.
  const lead = (reach: number, trim: number, run: number): number => {
    const room = Math.min(Math.max(0, reach - LEAD - trim), run / 4);
    return room + Math.min(reach - trim - room, (run - room) / 4);
  };
  const arrives = endReach > endTrim && (!straight(last) || turns(last - 1)) ? lead(endReach, endTrim, along(last, edx, edy)) : 0;
  const leaves = startReach > startTrim && (!straight(1) || turns(1)) ? lead(startReach, startTrim, along(1, sdx, sdy)) : 0;
  if (arrives >= 1) {
    xs.splice(last, 0, xs[last] - edx * arrives);
    ys.splice(last, 0, ys[last] - edy * arrives);
    axes.splice(last, 0, axes[last]);
    last++;
  }
  if (leaves >= 1) {
    xs.splice(1, 0, xs[0] + sdx * leaves);
    ys.splice(1, 0, ys[0] + sdy * leaves);
    axes.splice(1, 0, axes[1]);
    last++;
  }

  let d = `M${num(xs[0])},${num(ys[0])}`;
  let atX = xs[0];
  let atY = ys[0];
  const lineTo = (x: number, y: number): void => {
    if (near(x, y, atX, atY)) return;
    d += `L${num(x)},${num(y)}`;
    atX = x;
    atY = y;
  };
  for (let i = 1; i <= last; i++) {
    const x = xs[i];
    const y = ys[i];
    if (!straight(i)) {
      const down = axes[i] === 0;
      const along = down ? y - atY : x - atX;
      const k = Math.abs(along) * ease(down ? x - atX : y - atY, along);
      const ux = down ? 0 : Math.sign(along) * k;
      const uy = down ? Math.sign(along) * k : 0;
      d += `C${num(atX + ux)},${num(atY + uy)} ${num(x - ux)},${num(y - uy)} ${num(x)},${num(y)}`;
      atX = x;
      atY = y;
      continue;
    }
    if (!turns(i)) {
      // A point part of the way along one straight run adds nothing to the path.
      if (i < last && aligned(i) && aligned(i + 1) && (x - xs[i - 1]) * (xs[i + 1] - x) + (y - ys[i - 1]) * (ys[i + 1] - y) > 0) continue;
      lineTo(x, y);
      continue;
    }
    // How much of the leg before the turn and of the leg after it the turn takes: all of one
    // that ends at a node, short of the straight run into a marker, and half of one it shares.
    let before = turns(i - 1) ? length(i) / 2 : length(i);
    let after = turns(i + 1) ? length(i + 1) / 2 : length(i + 1);
    if (stepped) before = after = Math.min(CORNER, before, after);
    const [ux, uy] = unit(i - 1, i, axes[i]);
    const [vx, vy] = unit(i, i + 1, axes[i + 1]);
    lineTo(x - ux * before, y - uy * before);
    atX = x + vx * after;
    atY = y + vy * after;
    if (stepped) d += `Q${num(x)},${num(y)} ${num(atX)},${num(atY)}`;
    else d += `C${num(x - ux * before * (1 - HANDLE))},${num(y - uy * before * (1 - HANDLE))} ${num(x + vx * after * (1 - HANDLE))},${num(y + vy * after * (1 - HANDLE))} ${num(atX)},${num(atY)}`;
  }
  return { d, sx, sy, sdx: -sdx, sdy: -sdy, ex, ey, edx, edy };
}

export function markerTrim(type: string): number {
  return type === 'arrow_point' ? ARROW - 1 : type === 'arrow_circle' ? ARROW : type === 'arrow_cross' ? 4 : 0;
}

// Draws a marker whose tip is at (x, y), pointing along (dx, dy).
export function marker(type: string, x: number, y: number, dx: number, dy: number, color: string, stroke = 'none'): string {
  const nx = -dy;
  const ny = dx;
  if (type === 'arrow_point') {
    const bx = x - dx * ARROW;
    const by = y - dy * ARROW;
    const half = ARROW * 0.42;
    return `<path class="pele-marker" d="M${num(x)},${num(y)}L${num(bx + nx * half)},${num(by + ny * half)}L${num(
      bx - nx * half
    )},${num(by - ny * half)}Z" fill="${color}" stroke="${stroke}"/>`;
  }
  if (type === 'arrow_circle') {
    return `<circle class="pele-marker" cx="${num(x - dx * 4)}" cy="${num(y - dy * 4)}" r="3.5" fill="${color}" stroke="${stroke}"/>`;
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

// Samples curves and arcs; NaN separates subpaths.
function pathPoints(d: string): number[] {
  const out: number[] = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, rest] of d.matchAll(/([MLHVCQA])([^MLHVCQA]*)/g)) {
    const n = (rest.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    if (cmd === 'H' || cmd === 'V') {
      for (const v of n) {
        if (cmd === 'H') x = v;
        else y = v;
        out.push(x, y);
      }
    } else if (cmd === 'C' || cmd === 'Q') {
      const step = cmd === 'C' ? 6 : 4;
      for (let k = 0; k + step <= n.length; k += step) {
        const xs = [x, ...n.slice(k, k + step).filter((_, i) => i % 2 === 0)];
        const ys = [y, ...n.slice(k, k + step).filter((_, i) => i % 2 === 1)];
        for (let t = 0.125; t <= 1; t += 0.125) {
          const px = xs.slice();
          const py = ys.slice();
          for (let m = px.length - 1; m > 0; m--) {
            for (let i = 0; i < m; i++) {
              px[i] += (px[i + 1] - px[i]) * t;
              py[i] += (py[i + 1] - py[i]) * t;
            }
          }
          out.push(px[0], py[0]);
        }
        x = xs[xs.length - 1];
        y = ys[ys.length - 1];
      }
    } else if (cmd === 'A') {
      for (let k = 0; k + 7 <= n.length; k += 7) {
        arc(out, x, y, n[k], n[k + 1], n[k + 3], n[k + 4], n[k + 5], n[k + 6]);
        x = n[k + 5];
        y = n[k + 6];
      }
    } else {
      for (let k = 0; k + 2 <= n.length; k += 2) {
        if (cmd === 'M' && k === 0 && out.length > 0) out.push(NaN, NaN);
        x = n[k];
        y = n[k + 1];
        out.push(x, y);
      }
    }
  }
  return out;
}

// Samples an unrotated arc from (x1, y1), after SVG's conversion from end points to a center.
function arc(out: number[], x1: number, y1: number, rx: number, ry: number, large: number, sweep: number, x2: number, y2: number): void {
  const hx = (x1 - x2) / 2;
  const hy = (y1 - y2) / 2;
  if (rx === 0 || ry === 0 || (hx === 0 && hy === 0)) {
    out.push(x2, y2);
    return;
  }
  const scale = Math.max(1, Math.sqrt((hx * hx) / (rx * rx) + (hy * hy) / (ry * ry)));
  rx *= scale;
  ry *= scale;
  const k =
    (large === sweep ? -1 : 1) *
    Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * hy * hy - ry * ry * hx * hx) / (rx * rx * hy * hy + ry * ry * hx * hx)));
  const cx = (k * rx * hy) / ry + (x1 + x2) / 2;
  const cy = (-k * ry * hx) / rx + (y1 + y2) / 2;
  const from = Math.atan2((y1 - cy) / ry, (x1 - cx) / rx);
  let turn = Math.atan2((y2 - cy) / ry, (x2 - cx) / rx) - from;
  if (sweep && turn < 0) turn += 2 * Math.PI;
  else if (!sweep && turn > 0) turn -= 2 * Math.PI;
  for (let i = 1; i <= 8; i++) out.push(cx + rx * Math.cos(from + (turn * i) / 8), cy + ry * Math.sin(from + (turn * i) / 8));
}

function enters(points: number[], l: number, t: number, r: number, b: number): boolean {
  for (let k = 0; k + 2 < points.length; k += 2) {
    const x = points[k];
    const y = points[k + 1];
    const dx = points[k + 2] - x;
    const dy = points[k + 3] - y;
    let lo = 0;
    let hi = 1;
    for (const [p, q] of [[-dx, x - l], [dx, r - x], [-dy, y - t], [dy, b - y]]) {
      if (p === 0) {
        if (q < 0) hi = -1;
      } else if (p < 0) lo = Math.max(lo, q / p);
      else hi = Math.min(hi, q / p);
    }
    if (lo < hi) return true;
  }
  return false;
}

// Whether a path runs inside any of the boxes, each given as left, top, right, bottom.
export function runsInside(d: string, boxes: number[]): boolean {
  if (boxes.length === 0) return false;
  const points = pathPoints(d);
  for (let b = 0; b < boxes.length; b += 4) if (enters(points, boxes[b] + 0.5, boxes[b + 1] + 0.5, boxes[b + 2] - 0.5, boxes[b + 3] - 0.5)) return true;
  return false;
}

// Fill bounds are [left, top, right, bottom].
export interface Fill {
  box: number[];
  shape: string;
}

// The innermost fill holding the whole edge and its marker tips, '' when it crosses a border, or undefined off fills.
export function fillUnder(d: string, tips: number[], fills: Fill[]): Fill | '' | undefined {
  if (fills.length === 0) return undefined;
  const points = pathPoints(d);
  let holder: Fill | undefined;
  let least = Infinity;
  for (const fill of fills) {
    const [l, t, r, b] = fill.box;
    let touched = enters(points, l + 0.5, t + 0.5, r - 0.5, b - 0.5);
    for (let k = 0; k < tips.length && !touched; k += 2) touched = tips[k] > l + 0.5 && tips[k] < r - 0.5 && tips[k + 1] > t + 0.5 && tips[k + 1] < b - 0.5;
    if (!touched) continue;
    const all = points.concat(tips);
    for (let k = 0; k < all.length; k += 2) {
      if (!Number.isNaN(all[k]) && !(all[k] >= l && all[k] <= r && all[k + 1] >= t && all[k + 1] <= b)) return '';
    }
    const area = (r - l) * (b - t);
    if (area < least) {
      least = area;
      holder = fill;
    }
  }
  return holder;
}

// The fill's ink for an edge on it, or '' for a casing when unknown or when the line style sets a stroke.
export function edgeInk(fill: Fill, line = ''): string {
  return (/[";]stroke:/.test(line) ? undefined : ink(fill.shape)) ?? '';
}

// Markers with the page color inside them, with the fill's color there instead.
export function hollowOn(markers: string, fill: Fill): string {
  const color = /[";]fill:([^;"]*)/.exec(fill.shape)?.[1].trim();
  return color ? markers.replace(/ fill="var\(--_bg\)"/g, ` fill="${color}"`) : markers;
}

// The ink of the innermost fill that holds the whole edge, '' for a casing where it crosses a border, or undefined off fills.
export function overFills(d: string, tips: number[], fills: Fill[], line = ''): string | undefined {
  const fill = fillUnder(d, tips, fills);
  return fill ? edgeInk(fill, line) : fill;
}

const CASE = 4;

// A wider page-colored stroke under an edge, as faint as it; markers drop their class so marker styles skip it.
export function casing(d: string, markers: string, line = '', thick = false): string {
  const decl = (prop: string): string | undefined => new RegExp(`[";]${prop}:([^;"]+);`).exec(line)?.[1].trim();
  const stroke = decl('stroke');
  if (stroke === 'none' || stroke === 'transparent') return '';
  const width = thick ? '2.5' : decl('stroke-width');
  let attrs = '';
  let style = '';
  if (width !== undefined && /^[\d.]+(?:px)?$/.test(width)) {
    if (parseFloat(width) !== 1) attrs = ` stroke-width="${num(parseFloat(width) + CASE)}"`;
  } else if (width !== undefined) {
    style += `stroke-width:calc(${width} + ${CASE}px);`;
  }
  for (const prop of ['opacity', 'stroke-opacity']) {
    const value = decl(prop);
    if (value !== undefined) style += `${prop}:${value};`;
  }
  const body = `<path d="${d}"/>` + markers.replace(/ class="pele-marker"/g, '');
  return attrs || style ? `<g${attrs}${style ? ` style="${style}"` : ''}>${body}</g>` : body;
}

export function edgeCasing(path: EdgePath, startType: string, endType: string, line = '', thick = false): string {
  return casing(
    path.d,
    marker(startType, path.sx, path.sy, path.sdx, path.sdy, 'var(--_bg)', 'var(--_bg)') +
      marker(endType, path.ex, path.ey, path.edx, path.edy, 'var(--_bg)', 'var(--_bg)'),
    line,
    thick
  );
}

export function casingsSvg(casings: string): string {
  return casings
    ? `<g class="pele-casings" fill="none" stroke="var(--_bg)" stroke-width="${1 + CASE}" stroke-linecap="round" stroke-linejoin="round" pointer-events="none">${casings}</g>`
    : '';
}

// An edge label on a patch of the background, so the line does not run through the text.
export function edgeLabelSvg(id: string, label: Label, x: number, y: number, attrs: string, icons?: IconResolver): string {
  const w = label.width + 8;
  const h = label.height;
  return (
    `<g class="pele-edge-label" data-id="${escText(id)}">` +
    `<rect x="${num(x - w / 2)}" y="${num(y - h / 2)}" width="${num(w)}" height="${num(h)}" rx="3" fill="var(--_bg)"/>` +
    labelSvg(label, x, y, attrs, icons) +
    '</g>'
  );
}

// A self-loop beside a node of drawn size w by h: out of the side that lies across the flow and
// back in. `k` counts the loops already on the node, so each one reaches a little further.
// Also places the edge's label beyond the loop.
export function loopPath(
  c: { x: number; y: number },
  w: number,
  h: number,
  k: number,
  sideways: boolean,
  base: number,
  trim: number,
  e: { labelW: number; labelH: number; labelX: number; labelY: number }
): EdgePath {
  const half = (sideways ? w : h) / 2;
  const spread = Math.min(half - 4, 8 + k * 6);
  const reach = base + k * 8;
  const len = Math.hypot(reach, spread) || 1;
  // Local frame: `out` points away from the node, `along` runs along its side.
  const at = (out: number, along: number): string =>
    sideways ? `${num(c.x + along)},${num(c.y + h / 2 + out)}` : `${num(c.x + w / 2 + out)},${num(c.y + along)}`;
  const tx = (reach / len) * trim;
  const ty = (spread / len) * trim;
  if (sideways) {
    e.labelX = c.x;
    e.labelY = c.y + h / 2 + reach + 4 + e.labelH / 2;
  } else {
    e.labelX = c.x + w / 2 + reach + 4 + e.labelW / 2;
    e.labelY = c.y;
  }
  return {
    d: `M${at(0, -spread)}C${at(reach, -spread * 2)} ${at(reach, spread * 2)} ${at(tx, spread + ty)}`,
    sx: sideways ? c.x - spread : c.x + w / 2,
    sy: sideways ? c.y + h / 2 : c.y - spread,
    sdx: sideways ? 0 : -1,
    sdy: sideways ? -1 : 0,
    ex: sideways ? c.x + spread : c.x + w / 2,
    ey: sideways ? c.y + h / 2 : c.y + spread,
    edx: sideways ? -spread / len : -reach / len,
    edy: sideways ? -reach / len : -spread / len,
  };
}
