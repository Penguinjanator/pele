import type { CNode } from '../layout/compound.js';

// The x of every route point, by its rounded y: the edges that cross a cluster's top border.
export type Crossings = Map<number, number[]>;

export function markCrossings(crossings: Crossings, route: number[]): void {
  for (let k = 0; k < route.length; k += 3) {
    const key = Math.round(route[k + 1]);
    const list = crossings.get(key);
    if (list) list.push(route[k]);
    else crossings.set(key, [route[k]]);
  }
}

// Picks where a cluster title sits along the top edge so that edges entering there do not cross it.
export function clusterTitleX(c: CNode, width: number, crossings: Crossings, pad: number): number {
  if (width === 0) return c.x;
  const top = c.y - c.h / 2;
  const left = c.x - c.w / 2;
  const half = width / 2;
  const candidates = [left + pad - 6 + half, c.x, left + c.w - pad + 6 - half];
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
