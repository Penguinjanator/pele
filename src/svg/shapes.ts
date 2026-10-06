import { num } from './builder.js';
import { RADIUS } from './theme.js';

export interface ShapeSize {
  w: number;
  h: number;
  // Vertical shift of the label from the shape's center.
  dy: number;
}

export const PAD_X = 18;
export const PAD_Y = 12;

type Sizer = (tw: number, th: number) => ShapeSize;
type Drawer = (w: number, h: number, a: string, line: string) => string;

// Distance from the bounding box to the outline at the middle of a side: 0 top, 1 right, 2 bottom, 3 left.
type Inset = (w: number, h: number, side: number) => number;

interface ShapeDef {
  size: Sizer;
  draw: Drawer;
  inset?: Inset;
}

const leanInset: Inset = (_w, h, side) => (side & 1 ? h / 8 : 0);

const box: Sizer = (tw, th) => ({ w: Math.max(tw + 2 * PAD_X, 2 * PAD_X + 12), h: th + 2 * PAD_Y, dy: 0 });

function poly(points: number[], a: string): string {
  let d = '';
  for (let i = 0; i < points.length; i += 2) d += (i ? ' ' : '') + num(points[i]) + ',' + num(points[i + 1]);
  return `<polygon points="${d}"${a}/>`;
}

function rect(w: number, h: number, a: string, rx = ''): string {
  return `<rect x="${num(-w / 2)}" y="${num(-h / 2)}" width="${num(w)}" height="${num(h)}"${rx}${a}/>`;
}

const ROUNDED = ` rx="${RADIUS}"`;

const SHAPES: Record<string, ShapeDef> = {
  rect: { size: box, draw: (w, h, a) => rect(w, h, a, ROUNDED) },
  rounded: {
    size: box,
    draw: (w, h, a) => rect(w, h, a, ` rx="${num(Math.min(12, h / 2))}"`),
  },
  stadium: {
    size: (tw, th) => {
      const h = th + 2 * PAD_Y;
      return { w: tw + h * 0.5 + 2 * PAD_X - 8, h, dy: 0 };
    },
    draw: (w, h, a) => rect(w, h, a, ` rx="${num(h / 2)}"`),
  },
  'fr-rect': {
    size: (tw, th) => ({ w: tw + 2 * PAD_X + 16, h: th + 2 * PAD_Y, dy: 0 }),
    draw: (w, h, a, line) => {
      const x = w / 2 - 8;
      return (
        rect(w, h, a, ROUNDED) +
        `<path d="M${num(-x)},${num(-h / 2)}V${num(h / 2)}M${num(x)},${num(-h / 2)}V${num(h / 2)}" fill="none"${line}/>`
      );
    },
  },
  cyl: {
    size: (tw, th) => {
      const w = Math.max(tw + 2 * PAD_X, 56);
      const ry = Math.min(12, Math.max(6, w / 14));
      return { w, h: th + 2 * PAD_Y + 2 * ry, dy: ry / 2 };
    },
    draw: (w, h, a, line) => {
      const rx = w / 2;
      const ry = Math.min(12, Math.max(6, w / 14));
      const top = -h / 2 + ry;
      const bottom = h / 2 - ry;
      return (
        `<path d="M${num(-rx)},${num(top)}A${num(rx)},${num(ry)} 0 0 1 ${num(rx)},${num(top)}V${num(bottom)}A${num(
          rx
        )},${num(ry)} 0 0 1 ${num(-rx)},${num(bottom)}Z"${a}/>` +
        `<path d="M${num(-rx)},${num(top)}A${num(rx)},${num(ry)} 0 0 0 ${num(rx)},${num(top)}" fill="none"${line}/>`
      );
    },
  },
  circle: {
    size: (tw, th) => {
      const d = Math.max(Math.sqrt(tw * tw + th * th) + 16, 44);
      return { w: d, h: d, dy: 0 };
    },
    draw: (w, _h, a) => `<circle r="${num(w / 2)}"${a}/>`,
  },
  'dbl-circ': {
    size: (tw, th) => {
      const d = Math.max(Math.sqrt(tw * tw + th * th) + 26, 54);
      return { w: d, h: d, dy: 0 };
    },
    draw: (w, _h, a, line) => `<circle r="${num(w / 2)}"${a}/><circle r="${num(w / 2 - 5)}" fill="none"${line}/>`,
  },
  ellipse: {
    size: (tw, th) => ({ w: tw * 1.3 + 2 * PAD_X, h: th * 1.2 + 2 * PAD_Y, dy: 0 }),
    draw: (w, h, a) => `<ellipse rx="${num(w / 2)}" ry="${num(h / 2)}"${a}/>`,
  },
  diam: {
    size: (tw, th) => {
      const a = tw + 16;
      const b = th + 8;
      return { w: a + 1.6 * b, h: a / 1.6 + b, dy: 0 };
    },
    draw: (w, h, a) => poly([0, -h / 2, w / 2, 0, 0, h / 2, -w / 2, 0], a),
  },
  hex: {
    size: (tw, th) => {
      const h = th + 2 * PAD_Y;
      return { w: tw + 2 * PAD_X + h / 2, h, dy: 0 };
    },
    draw: (w, h, a) => {
      const m = h / 4;
      return poly([-w / 2 + m, -h / 2, w / 2 - m, -h / 2, w / 2, 0, w / 2 - m, h / 2, -w / 2 + m, h / 2, -w / 2, 0], a);
    },
  },
  odd: {
    inset: (_w, h, side) => (side === 3 ? h / 4 : 0),
    size: (tw, th) => {
      const h = th + 2 * PAD_Y;
      return { w: tw + 2 * PAD_X + h / 4, h, dy: 0 };
    },
    draw: (w, h, a) => {
      const notch = h / 4;
      return poly([-w / 2, -h / 2, w / 2, -h / 2, w / 2, h / 2, -w / 2, h / 2, -w / 2 + notch, 0], a);
    },
  },
  'lean-r': {
    inset: leanInset,
    size: (tw, th) => {
      const h = th + 2 * PAD_Y;
      return { w: tw + 2 * PAD_X + h / 2, h, dy: 0 };
    },
    draw: (w, h, a) => {
      const s = h / 4;
      return poly([-w / 2 + s, -h / 2, w / 2, -h / 2, w / 2 - s, h / 2, -w / 2, h / 2], a);
    },
  },
  'lean-l': {
    inset: leanInset,
    size: (tw, th) => {
      const h = th + 2 * PAD_Y;
      return { w: tw + 2 * PAD_X + h / 2, h, dy: 0 };
    },
    draw: (w, h, a) => {
      const s = h / 4;
      return poly([-w / 2, -h / 2, w / 2 - s, -h / 2, w / 2, h / 2, -w / 2 + s, h / 2], a);
    },
  },
  'trap-b': {
    inset: leanInset,
    size: (tw, th) => {
      const h = th + 2 * PAD_Y;
      return { w: tw + 2 * PAD_X + h / 2, h, dy: 0 };
    },
    draw: (w, h, a) => {
      const s = h / 4;
      return poly([-w / 2 + s, -h / 2, w / 2 - s, -h / 2, w / 2, h / 2, -w / 2, h / 2], a);
    },
  },
  'trap-t': {
    inset: leanInset,
    size: (tw, th) => {
      const h = th + 2 * PAD_Y;
      return { w: tw + 2 * PAD_X + h / 2, h, dy: 0 };
    },
    draw: (w, h, a) => {
      const s = h / 4;
      return poly([-w / 2, -h / 2, w / 2, -h / 2, w / 2 - s, h / 2, -w / 2 + s, h / 2], a);
    },
  },
  text: {
    size: (tw, th) => ({ w: tw + 8, h: th + 8, dy: 0 }),
    draw: (w, h) => rect(w, h, ' fill="none" stroke="none"'),
  },
  'sm-circ': { size: () => ({ w: 14, h: 14, dy: 0 }), draw: (w, _h, a) => `<circle r="${num(w / 2)}"${a}/>` },
  'f-circ': {
    size: () => ({ w: 14, h: 14, dy: 0 }),
    draw: (w, _h, _a, line) => `<circle r="${num(w / 2)}" fill="var(--_l)"${line}/>`,
  },
  'fr-circ': {
    size: () => ({ w: 18, h: 18, dy: 0 }),
    draw: (w, _h, a, line) => `<circle r="${num(w / 2)}"${a}/><circle r="${num(w / 2 - 4)}" fill="var(--_l)"${line}/>`,
  },
  fork: {
    size: () => ({ w: 72, h: 8, dy: 0 }),
    draw: (w, h, _a, line) => rect(w, h, ` fill="var(--_l)"${line}`, ' rx="2"'),
  },
  'notch-rect': {
    size: box,
    draw: (w, h, a) => {
      const c = 10;
      return poly([-w / 2 + c, -h / 2, w / 2, -h / 2, w / 2, h / 2, -w / 2, h / 2, -w / 2, -h / 2 + c], a);
    },
  },
  'lin-rect': {
    size: (tw, th) => ({ w: tw + 2 * PAD_X + 8, h: th + 2 * PAD_Y, dy: 0 }),
    draw: (w, h, a, line) =>
      rect(w, h, a, ROUNDED) +
      `<path d="M${num(-w / 2 + 8)},${num(-h / 2)}V${num(h / 2)}" fill="none"${line}/>`,
  },
  'div-rect': {
    size: (tw, th) => ({ w: tw + 2 * PAD_X, h: th + 2 * PAD_Y + 8, dy: 4 }),
    draw: (w, h, a, line) =>
      rect(w, h, a, ROUNDED) +
      `<path d="M${num(-w / 2)},${num(-h / 2 + 8)}H${num(w / 2)}" fill="none"${line}/>`,
  },
  'win-pane': {
    size: (tw, th) => ({ w: tw + 2 * PAD_X + 8, h: th + 2 * PAD_Y + 8, dy: 4 }),
    draw: (w, h, a, line) =>
      rect(w, h, a, ROUNDED) +
      `<path d="M${num(-w / 2 + 8)},${num(-h / 2)}V${num(h / 2)}M${num(-w / 2)},${num(-h / 2 + 8)}H${num(
        w / 2
      )}" fill="none"${line}/>`,
  },
  tri: {
    inset: (w, _h, side) => (side & 1 ? w / 4 : 0),
    size: (tw, th) => {
      const h = th + 2 * PAD_Y + tw * 0.4;
      return { w: tw + 2 * PAD_X + th * 1.4, h, dy: h / 6 };
    },
    draw: (w, h, a) => poly([0, -h / 2, w / 2, h / 2, -w / 2, h / 2], a),
  },
  'flip-tri': {
    inset: (w, _h, side) => (side & 1 ? w / 4 : 0),
    size: (tw, th) => {
      const h = th + 2 * PAD_Y + tw * 0.4;
      return { w: tw + 2 * PAD_X + th * 1.4, h, dy: -h / 6 };
    },
    draw: (w, h, a) => poly([-w / 2, -h / 2, w / 2, -h / 2, 0, h / 2], a),
  },
  'sl-rect': {
    inset: (_w, _h, side) => (side === 0 ? 5 : 0),
    size: (tw, th) => ({ w: tw + 2 * PAD_X, h: th + 2 * PAD_Y + 10, dy: 5 }),
    draw: (w, h, a) => poly([-w / 2, -h / 2 + 10, w / 2, -h / 2, w / 2, h / 2, -w / 2, h / 2], a),
  },
  'notch-pent': {
    size: (tw, th) => ({ w: tw + 2 * PAD_X, h: th + 2 * PAD_Y, dy: 0 }),
    draw: (w, h, a) => {
      const c = 10;
      return poly([-w / 2 + c, -h / 2, w / 2 - c, -h / 2, w / 2, -h / 2 + c, w / 2, h / 2, -w / 2, h / 2, -w / 2, -h / 2 + c], a);
    },
  },
  hourglass: {
    inset: (w, _h, side) => (side & 1 ? w / 2 : 0),
    size: () => ({ w: 32, h: 40, dy: 0 }),
    draw: (w, h, a) => poly([-w / 2, -h / 2, w / 2, -h / 2, -w / 2, h / 2, w / 2, h / 2], a),
  },
  delay: {
    size: (tw, th) => {
      const h = th + 2 * PAD_Y;
      return { w: tw + 2 * PAD_X + h / 4, h, dy: 0 };
    },
    draw: (w, h, a) => {
      const r = h / 2;
      return `<path d="M${num(-w / 2)},${num(-r)}H${num(w / 2 - r)}A${num(r)},${num(r)} 0 0 1 ${num(w / 2 - r)},${num(
        r
      )}H${num(-w / 2)}Z"${a}/>`;
    },
  },
  'h-cyl': {
    size: (tw, th) => {
      const h = th + 2 * PAD_Y;
      const rx = Math.min(12, h / 4);
      return { w: tw + 2 * PAD_X + 2 * rx, h, dy: 0 };
    },
    draw: (w, h, a, line) => {
      const ry = h / 2;
      const rx = Math.min(12, h / 4);
      const l = -w / 2 + rx;
      const r = w / 2 - rx;
      return (
        `<path d="M${num(l)},${num(-ry)}H${num(r)}A${num(rx)},${num(ry)} 0 0 1 ${num(r)},${num(ry)}H${num(l)}A${num(
          rx
        )},${num(ry)} 0 0 1 ${num(l)},${num(-ry)}Z"${a}/>` +
        `<path d="M${num(r)},${num(-ry)}A${num(rx)},${num(ry)} 0 0 0 ${num(r)},${num(ry)}" fill="none"${line}/>`
      );
    },
  },
  'cross-circ': {
    size: () => ({ w: 44, h: 44, dy: 0 }),
    draw: (w, _h, a, line) => {
      const r = w / 2;
      const k = r * Math.SQRT1_2;
      return (
        `<circle r="${num(r)}"${a}/>` +
        `<path d="M${num(-k)},${num(-k)}L${num(k)},${num(k)}M${num(k)},${num(-k)}L${num(-k)},${num(k)}" fill="none"${line}/>`
      );
    },
  },
  'st-rect': {
    size: (tw, th) => ({ w: tw + 2 * PAD_X + 8, h: th + 2 * PAD_Y + 8, dy: 4 }),
    draw: (w, h, a) => {
      const bw = w - 8;
      const bh = h - 8;
      let out = '';
      for (let i = 0; i < 3; i++) {
        const x = -w / 2 + (2 - i) * 4;
        const y = -h / 2 + i * 4;
        out += `<rect x="${num(x)}" y="${num(y)}" width="${num(bw)}" height="${num(bh)}"${ROUNDED}${a}/>`;
      }
      return out;
    },
  },
  doc: {
    inset: (_w, _h, side) => (side === 2 ? 10 : 0),
    size: (tw, th) => ({ w: tw + 2 * PAD_X, h: th + 2 * PAD_Y + 10, dy: -5 }),
    draw: (w, h, a) => wave(w, h, a),
  },
  flag: {
    inset: (_w, _h, side) => (side & 1 ? 0 : 8),
    size: (tw, th) => ({ w: tw + 2 * PAD_X, h: th + 2 * PAD_Y + 16, dy: 0 }),
    draw: (w, h, a) => {
      const x = w / 2;
      const y = h / 2 - 8;
      const q = w / 4;
      return `<path d="M${num(-x)},${num(-y)}q${num(q)},-10 ${num(2 * q)},0t${num(2 * q)},0V${num(y)}q${num(-q)},10 ${num(
        -2 * q
      )},0t${num(-2 * q)},0Z"${a}/>`;
    },
  },
};

function wave(w: number, h: number, a: string): string {
  const x = w / 2;
  const top = -h / 2;
  const base = h / 2 - 10;
  const q = w / 4;
  return `<path d="M${num(-x)},${num(top)}H${num(x)}V${num(base)}q${num(-q)},-12 ${num(-2 * q)},0t${num(
    -2 * q
  )},0Z"${a}/>`;
}

const FALLBACK = SHAPES.rect;

export function shapeSize(shape: string, tw: number, th: number): ShapeSize {
  return (SHAPES[shape] ?? FALLBACK).size(tw, th);
}

export function drawShape(shape: string, w: number, h: number, a: string, line: string): string {
  return (SHAPES[shape] ?? FALLBACK).draw(w, h, a, line);
}

export function shapeInset(shape: string, w: number, h: number, side: number): number {
  return SHAPES[shape]?.inset?.(w, h, side) ?? 0;
}

export function hasShape(shape: string): boolean {
  return shape in SHAPES;
}
