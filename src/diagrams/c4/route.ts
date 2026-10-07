import { num } from '../../svg/builder.js';

// A laid out shape or boundary: top-left corner, size, and the shared shape it is drawn as.
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  form: string;
}

export interface Route {
  d: string;
  // Where the markers go: the tip, and the way it points.
  sx: number;
  sy: number;
  sdx: number;
  sdy: number;
  ex: number;
  ey: number;
  edx: number;
  edy: number;
  // The stretch the label may sit on.
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  // The side of that stretch the label is pushed to, as a unit vector; zero centers it on the stretch.
  nx: number;
  ny: number;
  // When set, the label stays over the line and moves that way by at most this much.
  lean: number;
  // The widest the label should be.
  room: number;
  // The corners of the line, as x, y pairs.
  points: number[];
}

const LOOP = 28;
export const LANE = 20;
const LANE_STEP = 7;
const CORNER = 8;
// A wide label on an upright lane leans this far out from it, to the middle of the gap between columns.
const LEAN = 30;
// Label widths that fit the gap between two columns, and where there is room to spare.
const NARROW = 88;
const WIDE = 160;
// The shared person shape: a head of radius 13 centered 14 below the top, over a body that starts 26 below it.
export const HEAD = 26;

// The cap radii drawShape uses for the two cylinders.
export const cylRy = (w: number): number => Math.min(12, Math.max(6, w / 14));
export const queueRx = (h: number): number => Math.min(12, h / 4);

// How far along the segment from (px, py) by (dx, dy) it first meets the rectangle; Infinity when it misses.
function hitRect(x0: number, y0: number, x1: number, y1: number, px: number, py: number, dx: number, dy: number): number {
  let enter = 0;
  let leave = 1;
  if (dx === 0) {
    if (px < x0 || px > x1) return Infinity;
  } else {
    const a = (x0 - px) / dx;
    const b = (x1 - px) / dx;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
  }
  if (dy === 0) {
    if (py < y0 || py > y1) return Infinity;
  } else {
    const a = (y0 - py) / dy;
    const b = (y1 - py) / dy;
    enter = Math.max(enter, Math.min(a, b));
    leave = Math.min(leave, Math.max(a, b));
  }
  return enter <= leave ? enter : Infinity;
}

function hitEllipse(cx: number, cy: number, rx: number, ry: number, px: number, py: number, dx: number, dy: number): number {
  const ux = dx / rx;
  const uy = dy / ry;
  const vx = (px - cx) / rx;
  const vy = (py - cy) / ry;
  const a = ux * ux + uy * uy;
  const b = 2 * (ux * vx + uy * vy);
  const c = vx * vx + vy * vy - 1;
  const disc = b * b - 4 * a * c;
  if (a === 0 || disc < 0) return Infinity;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : c <= 0 ? 0 : Infinity;
}

// Where a segment from outside first meets the outline of a shape, as a fraction of the segment.
function hit(box: Box, px: number, py: number, qx: number, qy: number): number {
  const { x, y, w, h } = box;
  const dx = qx - px;
  const dy = qy - py;
  if (box.form === 'person') {
    return Math.min(hitRect(x, y + HEAD, x + w, y + h, px, py, dx, dy), hitEllipse(x + w / 2, y + 14, 13, 13, px, py, dx, dy));
  }
  if (box.form === 'cyl') {
    const ry = cylRy(w);
    return Math.min(
      hitRect(x, y + ry, x + w, y + h - ry, px, py, dx, dy),
      hitEllipse(x + w / 2, y + ry, w / 2, ry, px, py, dx, dy),
      hitEllipse(x + w / 2, y + h - ry, w / 2, ry, px, py, dx, dy)
    );
  }
  if (box.form === 'h-cyl') {
    const rx = queueRx(h);
    return Math.min(
      hitRect(x + rx, y, x + w - rx, y + h, px, py, dx, dy),
      hitEllipse(x + rx, y + h / 2, rx, h / 2, px, py, dx, dy),
      hitEllipse(x + w - rx, y + h / 2, rx, h / 2, px, py, dx, dy)
    );
  }
  return hitRect(x, y, x + w, y + h, px, py, dx, dy);
}

export function crosses(points: number[], x0: number, y0: number, x1: number, y1: number): boolean {
  for (let i = 2; i < points.length; i += 2) {
    const px = points[i - 2];
    const py = points[i - 1];
    if (hitRect(x0, y0, x1, y1, px, py, points[i] - px, points[i + 1] - py) <= 1) return true;
  }
  return false;
}

function contains(outer: Box, inner: Box): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    outer.x + outer.w >= inner.x + inner.w &&
    outer.y + outer.h >= inner.y + inner.h
  );
}

// The straight line from a to b: x, y of its start, then of its end.
function connect(a: Box, b: Box, shift: number): [number, number, number, number] {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  const down = contains(a, b);
  if (down || contains(b, a)) {
    // One holds the other: a short line from the nearest side of the outer box.
    const outer = down ? a : b;
    const inner = down ? b : a;
    const ix = inner.x + inner.w / 2;
    const iy = inner.y + inner.h / 2;
    const left = inner.x - outer.x;
    const right = outer.x + outer.w - inner.x - inner.w;
    const top = inner.y - outer.y;
    const bottom = outer.y + outer.h - inner.y - inner.h;
    const least = Math.min(left, right, top, bottom);
    const ox = least === left ? outer.x : least === right ? outer.x + outer.w : ix;
    const oy = least === left || least === right ? iy : least === bottom ? outer.y + outer.h : outer.y;
    const t = Math.min(hit(inner, ox, oy, ix, iy), 1);
    const mx = ox + (ix - ox) * t;
    const my = oy + (iy - oy) * t;
    return down ? [ox, oy, mx, my] : [mx, my, ox, oy];
  }

  let px = ax;
  let py = ay;
  let qx = bx;
  let qy = by;
  // Shapes that share a column or a row are joined by an upright or level line through the shared span.
  const x0 = Math.max(a.x, b.x);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y0 = Math.max(a.y, b.y);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x0 < x1) px = qx = (x0 + x1) / 2;
  else if (y0 < y1) py = qy = (y0 + y1) / 2;
  const len = Math.hypot(qx - px, qy - py) || 1;
  const nx = (-(qy - py) / len) * shift;
  const ny = ((qx - px) / len) * shift;
  let ta = hit(a, qx + nx, qy + ny, px + nx, py + ny);
  let tb = hit(b, px + nx, py + ny, qx + nx, qy + ny);
  if (ta <= 1 && tb <= 1) {
    px += nx;
    py += ny;
    qx += nx;
    qy += ny;
  } else {
    px = ax;
    py = ay;
    qx = bx;
    qy = by;
    ta = Math.min(hit(a, qx, qy, px, py), 1);
    tb = Math.min(hit(b, px, py, qx, qy), 1);
  }
  return [qx + (px - qx) * ta, qy + (py - qy) * ta, px + (qx - px) * tb, py + (qy - py) * tb];
}

// Routes a relation from a to b. `shift` moves the line sideways when another runs the opposite way.
// `others` are the shapes to steer clear of; undefined skips that check. `lanes` counts the detours
// already running along each gap, so that the next one runs a little further out.
export function route(
  a: Box,
  b: Box,
  shift: number,
  others: Box[] | undefined,
  lanes: Map<number, number>,
  startTrim: number,
  endTrim: number
): Route {
  if (a === b) {
    const spread = Math.min(a.h / 2 - 4, 10);
    const len = Math.hypot(LOOP, spread);
    const x = a.x + a.w;
    const cy = a.y + a.h / 2;
    const ux = LOOP / len;
    const uy = spread / len;
    return {
      d:
        `M${num(x + ux * startTrim)},${num(cy - spread - uy * startTrim)}C${num(x + LOOP)},${num(cy - spread * 2)} ` +
        `${num(x + LOOP)},${num(cy + spread * 2)} ${num(x + ux * endTrim)},${num(cy + spread + uy * endTrim)}`,
      sx: x,
      sy: cy - spread,
      sdx: -ux,
      sdy: uy,
      ex: x,
      ey: cy + spread,
      edx: -ux,
      edy: -uy,
      x0: x + LOOP + 4,
      y0: cy,
      x1: x + LOOP + 4,
      y1: cy,
      nx: 1,
      ny: 0,
      lean: 0,
      room: 64,
      points: [],
    };
  }

  const [sx, sy, ex, ey] = connect(a, b, shift);
  const upright = sx === ex;
  if (others && (upright || sy === ey) && !contains(a, b) && !contains(b, a)) {
    // The line would pass behind the shapes between two in the same column or row.
    // Go around them instead: out of one side, along the gap beside them, and back in.
    const forward = upright ? ey > sy : ex < sx;
    let lane = forward ? -Infinity : Infinity;
    const widen = (box: Box): void => {
      const edge = upright ? box.x : box.y;
      lane = forward ? Math.max(lane, edge + (upright ? box.w : box.h)) : Math.min(lane, edge);
    };
    let blocked = false;
    for (const other of others) {
      if (other !== a && other !== b && hitRect(other.x, other.y, other.x + other.w, other.y + other.h, sx, sy, ex - sx, ey - sy) <= 1) {
        blocked = true;
        widen(other);
      }
    }
    if (blocked) {
      widen(a);
      widen(b);
      const sign = forward ? 1 : -1;
      const key = lane * 4 + (upright ? 2 : 0) + (forward ? 1 : 0);
      const used = lanes.get(key) ?? 0;
      lanes.set(key, used + 1);
      lane += sign * (LANE + Math.min(used, 4) * LANE_STEP);
      const r = CORNER * sign;
      // Each end leaves its shape a quarter of the way from the middle towards the other, clear of
      // the straight lines that meet the middle of the same side.
      const ax = a.x + a.w / 2;
      const ay = a.y + a.h / 2;
      const bx = b.x + b.w / 2;
      const by = b.y + b.h / 2;
      if (upright) {
        const turn = CORNER * Math.sign(by - ay);
        const y0 = ay + (Math.sign(by - ay) * a.h) / 4;
        const y1 = by - (Math.sign(by - ay) * b.h) / 4;
        const x0 = lane + (ax - lane) * Math.min(hit(a, lane, y0, ax, y0), 1);
        const x1 = lane + (bx - lane) * Math.min(hit(b, lane, y1, bx, y1), 1);
        return {
          d:
            `M${num(x0 + sign * startTrim)},${num(y0)}H${num(lane - r)}Q${num(lane)},${num(y0)} ${num(lane)},${num(y0 + turn)}` +
            `V${num(y1 - turn)}Q${num(lane)},${num(y1)} ${num(lane - r)},${num(y1)}H${num(x1 + sign * endTrim)}`,
          sx: x0,
          sy: y0,
          sdx: -sign,
          sdy: 0,
          ex: x1,
          ey: y1,
          edx: -sign,
          edy: 0,
          x0: lane,
          y0,
          x1: lane,
          y1,
          nx: sign,
          ny: 0,
          lean: LEAN,
          room: NARROW,
          points: [x0, y0, lane, y0, lane, y1, x1, y1],
        };
      }
      const turn = CORNER * Math.sign(bx - ax);
      const x0 = ax + (Math.sign(bx - ax) * a.w) / 4;
      const x1 = bx - (Math.sign(bx - ax) * b.w) / 4;
      const y0 = lane + (ay - lane) * Math.min(hit(a, x0, lane, x0, ay), 1);
      const y1 = lane + (by - lane) * Math.min(hit(b, x1, lane, x1, by), 1);
      return {
        d:
          `M${num(x0)},${num(y0 + sign * startTrim)}V${num(lane - r)}Q${num(x0)},${num(lane)} ${num(x0 + turn)},${num(lane)}` +
          `H${num(x1 - turn)}Q${num(x1)},${num(lane)} ${num(x1)},${num(lane - r)}V${num(y1 + sign * endTrim)}`,
        sx: x0,
        sy: y0,
        sdx: 0,
        sdy: -sign,
        ex: x1,
        ey: y1,
        edx: 0,
        edy: -sign,
        x0,
        y0: lane,
        x1,
        y1: lane,
        nx: 0,
        ny: 0,
        lean: 0,
        room: WIDE,
        points: [x0, y0, x0, lane, x1, lane, x1, y1],
      };
    }
  }

  const len = Math.hypot(ex - sx, ey - sy) || 1;
  const dx = (ex - sx) / len;
  const dy = (ey - sy) / len;
  return {
    d: `M${num(sx + dx * startTrim)},${num(sy + dy * startTrim)}L${num(ex - dx * endTrim)},${num(ey - dy * endTrim)}`,
    sx,
    sy,
    sdx: -dx,
    sdy: -dy,
    ex,
    ey,
    edx: dx,
    edy: dy,
    x0: sx,
    y0: sy,
    x1: ex,
    y1: ey,
    nx: shift ? -dy : 0,
    ny: shift ? dx : 0,
    lean: 0,
    room: Math.abs(dx) > Math.abs(dy) ? NARROW : WIDE,
    points: [sx, sy, ex, ey],
  };
}
