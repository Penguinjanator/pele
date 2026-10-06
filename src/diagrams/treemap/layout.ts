import type { TreemapNode } from './model.js';

export interface Box {
  node: TreemapNode;
  parent: Box | undefined;
  // Position among the top-level nodes of the branch this box belongs to, which picks its color.
  series: number;
  // A leaf's own value, or the sum of the leaves under a section.
  value: number;
  children: Box[];
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Insets {
  gap: number;
  // Space a section keeps for its header, and around its children on the other three sides.
  header: number;
  side: number;
}

function box(node: TreemapNode, parent: Box | undefined, series: number): Box {
  const value = node.children === undefined && Number.isFinite(node.value) && node.value! > 0 ? node.value! : 0;
  return { node, parent, series, value, children: [], x: 0, y: 0, w: 0, h: 0 };
}

// Lays out boxes[from..to) in the rectangle as one squarified treemap: rows are added along the
// shorter side, and a row stops growing when another box would make its boxes less square.
function squarify(boxes: Box[], total: number, x: number, y: number, w: number, h: number, gap: number): void {
  let rest = total;
  let from = 0;
  while (from < boxes.length) {
    const scale = (w * h) / rest;
    const side = Math.min(w, h);
    let sum = boxes[from].value * scale;
    const largest = sum;
    let worst = Math.max((side * side * largest) / (sum * sum), (sum * sum) / (side * side * largest));
    let to = from + 1;
    while (to < boxes.length) {
      const smallest = boxes[to].value * scale;
      const next = sum + smallest;
      const ratio = Math.max((side * side * largest) / (next * next), (next * next) / (side * side * smallest));
      if (ratio > worst) break;
      worst = ratio;
      sum = next;
      to++;
    }

    const thickness = sum / side;
    let offset = 0;
    for (let i = from; i < to; i++) {
      const b = boxes[i];
      const length = i === to - 1 ? side - offset : (b.value * scale) / thickness;
      const bx = w >= h ? x : x + offset;
      const by = w >= h ? y + offset : y;
      const x0 = Math.round(bx + gap / 2);
      const y0 = Math.round(by + gap / 2);
      b.x = x0;
      b.y = y0;
      b.w = Math.round(bx + (w >= h ? thickness : length) - gap / 2) - x0;
      b.h = Math.round(by + (w >= h ? length : thickness) - gap / 2) - y0;
      offset += length;
      rest -= b.value;
    }
    if (w >= h) {
      x += thickness;
      w -= thickness;
    } else {
      y += thickness;
      h -= thickness;
    }
    from = to;
  }
}

// Returns every box with a size, parents before their children.
export function layoutTreemap(roots: TreemapNode[], width: number, height: number, insets: Insets): Box[] {
  const top = roots.map((node, index) => box(node, undefined, index));
  const all = top.slice();
  for (let i = 0; i < all.length; i++) {
    const parent = all[i];
    for (const node of parent.node.children ?? []) {
      const child = box(node, parent, parent.series);
      parent.children.push(child);
      all.push(child);
    }
  }
  for (let i = all.length - 1; i >= 0; i--) {
    const b = all[i];
    if (b.parent) b.parent.value += b.value;
  }

  const { gap, header, side } = insets;
  const placed: Box[] = [];
  const place = (children: Box[], x: number, y: number, w: number, h: number): void => {
    if (w <= 0 || h <= 0) return;
    const shown = children.filter((b) => b.value > 0).sort((a, b) => b.value - a.value);
    let total = 0;
    for (const b of shown) total += b.value;
    if (shown.length === 0 || !Number.isFinite(total)) return;
    squarify(shown, total, x - gap / 2, y - gap / 2, w + gap, h + gap, gap);
    for (const b of shown) if (b.w > 0 && b.h > 0) placed.push(b);
  };

  place(top, 0, 0, width, height);
  for (let i = 0; i < placed.length; i++) {
    const b = placed[i];
    if (b.children.length > 0) place(b.children, b.x + side, b.y + header, b.w - 2 * side, b.h - header - side);
  }
  return placed;
}
