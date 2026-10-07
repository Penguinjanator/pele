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

// The most a corner between two straight runs is rounded by.
const CORNER = 12;
// How far a curve runs straight before a marker at its end.
const LEAD = 6;

// Builds the path for a route of x, y, axis triples, trimming both ends to leave room for markers.
// Where two straight runs meet at a right angle, the corner is rounded, except in a linear route.
export function routePath(route: number[], curve: string | undefined, startTrim: number, endTrim: number): EdgePath {
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
  let count = xs.length;
  const aligned = (i: number): boolean => Math.abs(xs[i] - xs[i - 1]) < 0.01 || Math.abs(ys[i] - ys[i - 1]) < 0.01;
  const straight = (i: number): boolean => linear || aligned(i);

  const unit = (i: number, j: number, axis: number, bent: boolean): [number, number] => {
    if (bent) return axis === 0 ? [0, Math.sign(ys[j] - ys[i]) || 1] : [Math.sign(xs[j] - xs[i]) || 1, 0];
    const dx = xs[j] - xs[i];
    const dy = ys[j] - ys[i];
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  };
  let last = count - 1;
  const [sdx, sdy] = unit(0, 1, axes[1], !straight(1));
  const [edx, edy] = unit(last - 1, last, axes[last], !straight(last));
  const sx = xs[0];
  const sy = ys[0];
  const ex = xs[last];
  const ey = ys[last];
  xs[0] += sdx * startTrim;
  ys[0] += sdy * startTrim;
  xs[last] -= edx * endTrim;
  ys[last] -= edy * endTrim;
  // A curve that ends in a marker runs straight for a little way first, where it has the room,
  // so that the marker does not sit on the bend.
  const lead = (i: number, j: number): number => (straight(Math.max(i, j)) ? 0 : Math.min(LEAD, (Math.abs(xs[j] - xs[i]) * Math.abs(edx) + Math.abs(ys[j] - ys[i]) * Math.abs(edy)) / 4));
  if (endTrim > 0) {
    const run = lead(last - 1, last);
    if (run >= 2) {
      xs.splice(last, 0, xs[last] - edx * run);
      ys.splice(last, 0, ys[last] - edy * run);
      axes.splice(last, 0, axes[last]);
      count++;
      last++;
    }
  }

  // How far each corner is rounded: up to all of a run that ends the route, and half of one
  // that has a corner at its other end too.
  const length = (i: number): number => Math.abs(xs[i] - xs[i - 1]) + Math.abs(ys[i] - ys[i - 1]);
  const radius = (i: number): number => {
    if (linear || i < 1 || i >= last || !aligned(i) || !aligned(i + 1)) return 0;
    const turns = Math.abs(xs[i] - xs[i - 1]) < 0.01 !== Math.abs(xs[i + 1] - xs[i]) < 0.01;
    if (!turns) return 0;
    return Math.max(0, Math.min(CORNER, length(i) / (i === 1 ? 1 : 2), length(i + 1) / (i + 1 === last ? 1 : 2)));
  };

  let d = `M${num(xs[0])},${num(ys[0])}`;
  for (let i = 1; i < count; i++) {
    const x = xs[i];
    const y = ys[i];
    const px = xs[i - 1];
    const py = ys[i - 1];
    const axis = axes[i];
    if (straight(i)) {
      const r = radius(i);
      if (r < 0.5) {
        d += `L${num(x)},${num(y)}`;
        continue;
      }
      const [ux, uy] = unit(i - 1, i, axis, false);
      const [vx, vy] = unit(i, i + 1, axis, false);
      d += `L${num(x - ux * r)},${num(y - uy * r)}Q${num(x)},${num(y)} ${num(x + vx * r)},${num(y + vy * r)}`;
    } else if (axis === 0) {
      const k = (y - py) * ease(x - px, y - py);
      d += `C${num(px)},${num(py + k)} ${num(x)},${num(y - k)} ${num(x)},${num(y)}`;
    } else {
      const k = (x - px) * ease(y - py, x - px);
      d += `C${num(px + k)},${num(py)} ${num(x - k)},${num(y)} ${num(x)},${num(y)}`;
    }
  }
  return { d, sx, sy, sdx: -sdx, sdy: -sdy, ex, ey, edx, edy };
}

// How far along the flow a curve's handles reach, as a share of the way it travels along it. Half
// gives an even S. A curve that runs more than four times as far across as along turns sooner and
// crosses in a straighter line, so that the edges sharing a gap fan out and do not run together.
function ease(across: number, along: number): number {
  return Math.max(0.12, Math.min(0.5, (2 * Math.abs(along)) / (Math.abs(across) || 1)));
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
