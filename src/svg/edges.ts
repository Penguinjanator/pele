import { ease } from '../layout/layered.js';
import type { Label } from '../text/label.js';
import type { IconResolver } from '../types.js';
import { escText, labelSvg, num } from './builder.js';

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
// A curve that runs further across than along need not meet its node square to it at an end
// with a marker, where the marker and the straight run before it leave the curve little room
// and it would turn sharply: it leans the way it runs, by this much for each time further
// across than along that it runs, and by no more than MAX_LEAN (in radians).
const LEAN = 0.15;
const MAX_LEAN = Math.PI / 15;

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
  // The straight runs before a marker at each end, once they are in the route.
  let startLead = -1;
  let endLead = -1;
  const straight = (i: number): boolean => linear || aligned(i) || i === startLead || i === endLead;
  // The way the route heads from point i to point j, at an end of the route: where an S joins
  // them, along the flow, or leaning a little the way the S runs if `marked`.
  const unit = (i: number, j: number, axis: number, marked = false): [number, number] => {
    const dx = xs[j] - xs[i];
    const dy = ys[j] - ys[i];
    if (!straight(Math.max(i, j))) {
      const across = axis === 0 ? dx : dy;
      const along = axis === 0 ? dy : dx;
      const lean = marked ? Math.max(0, Math.min(MAX_LEAN, LEAN * (Math.abs(across / (along || 1)) - 1))) : 0;
      const a = Math.sin(lean) * Math.sign(across);
      const b = Math.cos(lean) * (Math.sign(along) || 1);
      return axis === 0 ? [a, b] : [b, a];
    }
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  };
  const [sdx, sdy] = unit(0, 1, axes[1], startTrim > 0);
  const [edx, edy] = unit(last - 1, last, axes[last], endTrim > 0);
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
    startLead = 1;
  }
  if (arrives >= 1) endLead = last;
  // The curves that leave the first node and reach the last, which head the way the ends do.
  const firstCurve = startLead + 2;
  const lastCurve = endLead < 0 ? last : last - 1;

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
      const flow = down ? [0, Math.sign(along)] : [Math.sign(along), 0];
      const [ux, uy] = i === firstCurve ? [sdx, sdy] : flow;
      const [vx, vy] = i === lastCurve ? [edx, edy] : flow;
      d += `C${num(atX + ux * k)},${num(atY + uy * k)} ${num(x - vx * k)},${num(y - vy * k)} ${num(x)},${num(y)}`;
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
export function marker(type: string, x: number, y: number, dx: number, dy: number, color: string): string {
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
