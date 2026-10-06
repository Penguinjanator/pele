// Layered (Sugiyama-style) layout of one flat graph. Ranks run down the y axis; callers
// rotate the result for other directions.

export const enum Kind {
  Node,
  Dummy,
  Label,
  StartPort,
  EndPort,
}

export interface LNode {
  w: number;
  h: number;
  kind: Kind;
  pin: number;
  x: number;
  y: number;
  rank: number;
}

export interface LEdge {
  tail: number;
  head: number;
  minlen: number;
  labelW: number;
  labelH: number;
  tailDx: number;
  headDx: number;
  reversed: boolean;
  points: number[];
  labelX: number;
  labelY: number;
}

export interface LayeredOptions {
  nodeSep: number;
  edgeSep: number;
  rankSep: number;
  portSep: number;
}

export interface LayeredResult {
  width: number;
  height: number;
}

export function lnode(w: number, h: number, kind: Kind = Kind.Node): LNode {
  return { w, h, kind, pin: 0, x: 0, y: 0, rank: 0 };
}

export function ledge(tail: number, head: number, minlen = 1, labelW = 0, labelH = 0): LEdge {
  return {
    tail,
    head,
    minlen,
    labelW,
    labelH,
    tailDx: 0,
    headDx: 0,
    reversed: false,
    points: [],
    labelX: 0,
    labelY: 0,
  };
}

const MAX_SWEEPS = 24;

// An edge gets a bend point in every rank it skips. Past this many, the longest edges are
// drawn as one direct curve instead, which keeps huge graphs from exhausting time and memory.
const MAX_DUMMIES = 20000;

function isDummy(kind: number): boolean {
  return kind === Kind.Dummy || kind === Kind.Label;
}

function sortRange(list: Int32Array, from: number, to: number, key: Int32Array | Float64Array): void {
  for (let i = from + 1; i < to; i++) {
    const item = list[i];
    const k = key[item];
    let j = i - 1;
    while (j >= from && (key[list[j]] > k || (key[list[j]] === k && list[j] > item))) {
      list[j + 1] = list[j];
      j--;
    }
    list[j + 1] = item;
  }
}

export function layered(nodes: LNode[], edges: LEdge[], opt: LayeredOptions): LayeredResult {
  const real = nodes.length;
  if (real === 0) return { width: 0, height: 0 };
  const m = edges.length;

  // Every edge gets a middle rank of its own when labels or parallel edges need the room.
  let step = 1;
  if (m > 0) {
    const seen = new Set<number>();
    for (const e of edges) {
      const a = Math.min(e.tail, e.head);
      const b = Math.max(e.tail, e.head);
      const key = a * real + b;
      if (e.labelW > 0 || seen.has(key)) {
        step = 2;
        break;
      }
      seen.add(key);
    }
  }

  orient(nodes, edges);
  rank(nodes, edges, step);

  const span = new Int32Array(m);
  let dummies = 0;
  for (let ei = 0; ei < m; ei++) {
    const e = edges[ei];
    span[ei] = Math.abs(nodes[e.head].rank - nodes[e.tail].rank);
    if (span[ei] > 1) dummies += span[ei] - 1;
  }
  const direct = new Uint8Array(m);
  if (dummies > MAX_DUMMIES) {
    const longest: number[] = [];
    for (let ei = 0; ei < m; ei++) if (span[ei] > 1) longest.push(ei);
    longest.sort((a, b) => span[b] - span[a] || a - b);
    for (const ei of longest) {
      if (dummies <= MAX_DUMMIES) break;
      direct[ei] = 1;
      dummies -= span[ei] - 1;
    }
  }

  const n = real + dummies;
  const W = new Float64Array(n);
  const H = new Float64Array(n);
  const KIND = new Uint8Array(n);
  const RANK = new Int32Array(n);
  let maxRank = 0;
  for (let i = 0; i < real; i++) {
    const node = nodes[i];
    W[i] = node.w;
    H[i] = node.h;
    KIND[i] = node.kind;
    RANK[i] = node.rank;
    if (node.rank > maxRank) maxRank = node.rank;
  }

  // The graph that gets ordered and positioned: every edge cut into rank-to-rank segments.
  let segments = 0;
  for (let ei = 0; ei < m; ei++) if (!direct[ei]) segments += span[ei];
  const EF = new Int32Array(segments);
  const ET = new Int32Array(segments);
  const EFD = new Float64Array(segments);
  const ETD = new Float64Array(segments);
  const firstDummy = new Int32Array(m).fill(-1);
  const labelNode = new Int32Array(m).fill(-1);
  let offsets = false;
  {
    let next = real;
    let ce = 0;
    for (let ei = 0; ei < m; ei++) {
      if (direct[ei]) continue;
      const e = edges[ei];
      const a = e.reversed ? e.head : e.tail;
      const b = e.reversed ? e.tail : e.head;
      const aDx = e.reversed ? e.headDx : e.tailDx;
      const bDx = e.reversed ? e.tailDx : e.headDx;
      if (aDx !== 0 || bDx !== 0) offsets = true;
      const ra = RANK[a];
      const rb = RANK[b];
      let labelRank = -1;
      if (e.labelW > 0) {
        labelRank = ra + ((rb - ra) >> 1);
        if (step === 2 && (labelRank & 1) === 0) labelRank--;
      }
      let prev = a;
      if (rb - ra > 1) firstDummy[ei] = next;
      for (let r = ra + 1; r < rb; r++) {
        const d = next++;
        RANK[d] = r;
        if (r === labelRank) {
          W[d] = e.labelW;
          H[d] = e.labelH;
          KIND[d] = Kind.Label;
          labelNode[ei] = d;
        } else {
          KIND[d] = Kind.Dummy;
        }
        EF[ce] = prev;
        ET[ce] = d;
        EFD[ce] = prev === a ? aDx : 0;
        ce++;
        prev = d;
      }
      EF[ce] = prev;
      ET[ce] = b;
      EFD[ce] = prev === a ? aDx : 0;
      ETD[ce] = bDx;
      ce++;
    }
  }

  const succStart = new Int32Array(n + 1);
  const predStart = new Int32Array(n + 1);
  for (let e = 0; e < segments; e++) {
    succStart[EF[e] + 1]++;
    predStart[ET[e] + 1]++;
  }
  for (let i = 0; i < n; i++) {
    succStart[i + 1] += succStart[i];
    predStart[i + 1] += predStart[i];
  }
  const succE = new Int32Array(segments);
  const predE = new Int32Array(segments);
  {
    const sf = succStart.slice(0, n);
    const pf = predStart.slice(0, n);
    for (let e = 0; e < segments; e++) {
      succE[sf[EF[e]]++] = e;
      predE[pf[ET[e]]++] = e;
    }
  }

  const layerStart = new Int32Array(maxRank + 2);
  for (let i = 0; i < n; i++) layerStart[RANK[i] + 1]++;
  for (let r = 0; r <= maxRank; r++) layerStart[r + 1] += layerStart[r];
  const order = new Int32Array(n);
  const pos = new Int32Array(n);

  // Initial order: depth-first from the top so that subtrees start out contiguous.
  {
    const byRank = new Int32Array(n);
    const fill = layerStart.slice(0, maxRank + 1);
    for (let i = 0; i < n; i++) byRank[fill[RANK[i]]++] = i;
    fill.set(layerStart.subarray(0, maxRank + 1));
    const visited = new Uint8Array(n);
    const stack: number[] = [];
    for (let k = 0; k < n; k++) {
      if (visited[byRank[k]]) continue;
      stack.push(byRank[k]);
      while (stack.length > 0) {
        const v = stack.pop()!;
        if (visited[v]) continue;
        visited[v] = 1;
        order[fill[RANK[v]]++] = v;
        for (let j = succStart[v + 1] - 1; j >= succStart[v]; j--) {
          const w = ET[succE[j]];
          if (!visited[w]) stack.push(w);
        }
      }
    }
  }

  let pinned = false;
  for (let i = 0; i < real; i++) if (nodes[i].pin !== 0) pinned = true;
  if (pinned) {
    for (let r = 0; r <= maxRank; r++) {
      const layer = Array.from(order.subarray(layerStart[r], layerStart[r + 1]));
      const index = new Map<number, number>();
      layer.forEach((v, i) => index.set(v, i));
      const pinOf = (v: number): number => (v < real ? nodes[v].pin : 0);
      layer.sort((a, b) => pinOf(a) - pinOf(b) || index.get(a)! - index.get(b)!);
      order.set(layer, layerStart[r]);
    }
  }
  const setPositions = (): void => {
    for (let r = 0; r <= maxRank; r++) {
      const s = layerStart[r];
      for (let i = s, e = layerStart[r + 1]; i < e; i++) pos[order[i]] = i - s;
    }
  };
  setPositions();

  const g: Graph = { n, real, maxRank, W, KIND, EF, ET, EFD, ETD, succStart, succE, predStart, predE, layerStart, order, pos, offsets };

  if (segments > 0 && maxRank > 0) {
    reduceCrossings(g, nodes);
    setPositions();
  }

  const xs = position(g, opt);

  // Ranks that hold only border ports or their pass-through dummies need little room of their own.
  const portOnly = (r: number, kind: Kind): boolean => {
    let found = false;
    for (let i = layerStart[r]; i < layerStart[r + 1]; i++) {
      const k = KIND[order[i]];
      if (k === kind) found = true;
      else if (k !== Kind.Dummy) return false;
    }
    return found;
  };
  const startRanks = portOnly(0, Kind.StartPort) ? step : 0;
  const endRanks = portOnly(maxRank, Kind.EndPort) ? step : 0;
  const bandTop = new Float64Array(maxRank + 1);
  const bandBottom = new Float64Array(maxRank + 1);
  let y = 0;
  for (let r = 0; r <= maxRank; r++) {
    let h = 0;
    for (let i = layerStart[r]; i < layerStart[r + 1]; i++) if (H[order[i]] > h) h = H[order[i]];
    bandTop[r] = y;
    bandBottom[r] = y + h;
    if (r === maxRank) y += h;
    else if (r < startRanks || r >= maxRank - endRanks) y += h + opt.portSep / step;
    else y += h + opt.rankSep / step;
  }
  const height = y;

  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < n; i++) {
    const half = W[i] / 2;
    if (xs[i] - half < minX) minX = xs[i] - half;
    if (xs[i] + half > maxX) maxX = xs[i] + half;
  }
  for (let i = 0; i < real; i++) {
    const node = nodes[i];
    node.x = xs[i] - minX;
    node.y = (bandTop[node.rank] + bandBottom[node.rank]) / 2;
  }

  for (let ei = 0; ei < m; ei++) {
    const e = edges[ei];
    const first = nodes[e.reversed ? e.head : e.tail];
    const last = nodes[e.reversed ? e.tail : e.head];
    const pts: number[] = [first.x + (e.reversed ? e.headDx : e.tailDx), first.y + first.h / 2];
    const d0 = firstDummy[ei];
    if (d0 >= 0) {
      for (let d = d0, end = d0 + span[ei] - 1; d < end; d++) {
        const x = xs[d] - minX;
        const top = bandTop[RANK[d]];
        const bottom = bandBottom[RANK[d]];
        pts.push(x, top);
        if (bottom > top) pts.push(x, bottom);
      }
    }
    pts.push(last.x + (e.reversed ? e.tailDx : e.headDx), last.y - last.h / 2);
    if (e.reversed) {
      for (let i = 0, j = pts.length - 2; i < j; i += 2, j -= 2) {
        const tx = pts[i];
        const ty = pts[i + 1];
        pts[i] = pts[j];
        pts[i + 1] = pts[j + 1];
        pts[j] = tx;
        pts[j + 1] = ty;
      }
    }
    e.points = pts;
    const ln = labelNode[ei];
    if (ln >= 0) {
      e.labelX = xs[ln] - minX;
      e.labelY = (bandTop[RANK[ln]] + bandBottom[RANK[ln]]) / 2;
    } else if (e.labelW > 0) {
      e.labelX = (pts[0] + pts[pts.length - 2]) / 2;
      e.labelY = (pts[1] + pts[pts.length - 1]) / 2;
    }
  }

  return { width: maxX - minX, height };
}

interface Graph {
  n: number;
  real: number;
  maxRank: number;
  W: Float64Array;
  KIND: Uint8Array;
  // Segment endpoints, and where each segment attaches on them.
  EF: Int32Array;
  ET: Int32Array;
  EFD: Float64Array;
  ETD: Float64Array;
  succStart: Int32Array;
  succE: Int32Array;
  predStart: Int32Array;
  predE: Int32Array;
  layerStart: Int32Array;
  order: Int32Array;
  pos: Int32Array;
  offsets: boolean;
}

// Reverses the edges that close a cycle, found by depth-first search in declaration order.
export function orient(nodes: LNode[], edges: LEdge[]): void {
  const n = nodes.length;
  const m = edges.length;
  const start = new Int32Array(n + 1);
  for (let i = 0; i < m; i++) {
    const e = edges[i];
    e.reversed = nodes[e.head].kind === Kind.StartPort || nodes[e.tail].kind === Kind.EndPort;
    if (!e.reversed) start[e.tail + 1]++;
  }
  for (let i = 0; i < n; i++) start[i + 1] += start[i];
  const out = new Int32Array(start[n]);
  {
    const fill = start.slice(0, n);
    for (let i = 0; i < m; i++) if (!edges[i].reversed) out[fill[edges[i].tail]++] = i;
  }
  const state = new Uint8Array(n);
  const cursor = start.slice(0, n);
  const stack: number[] = [];
  for (let root = 0; root < n; root++) {
    if (state[root] !== 0) continue;
    stack.push(root);
    state[root] = 1;
    while (stack.length > 0) {
      const v = stack[stack.length - 1];
      if (cursor[v] < start[v + 1]) {
        const e = edges[out[cursor[v]++]];
        const w = e.head;
        if (state[w] === 1) e.reversed = true;
        else if (state[w] === 0) {
          state[w] = 1;
          stack.push(w);
        }
      } else {
        state[v] = 2;
        stack.pop();
      }
    }
  }
}

export function rank(nodes: LNode[], edges: LEdge[], step: number): void {
  const n = nodes.length;
  const m = edges.length;
  const from = new Int32Array(m);
  const to = new Int32Array(m);
  const len = new Int32Array(m);
  const outStart = new Int32Array(n + 1);
  const inStart = new Int32Array(n + 1);
  for (let i = 0; i < m; i++) {
    const e = edges[i];
    const a = e.reversed ? e.head : e.tail;
    const b = e.reversed ? e.tail : e.head;
    from[i] = a;
    to[i] = b;
    len[i] = Math.max(1, e.minlen) * step;
    outStart[a + 1]++;
    inStart[b + 1]++;
  }
  for (let i = 0; i < n; i++) {
    outStart[i + 1] += outStart[i];
    inStart[i + 1] += inStart[i];
  }
  const outE = new Int32Array(m);
  const inE = new Int32Array(m);
  {
    const of = outStart.slice(0, n);
    const inf = inStart.slice(0, n);
    for (let i = 0; i < m; i++) {
      outE[of[from[i]]++] = i;
      inE[inf[to[i]]++] = i;
    }
  }

  const r = new Int32Array(n);
  const indeg = new Int32Array(n);
  for (let i = 0; i < n; i++) indeg[i] = inStart[i + 1] - inStart[i];
  const topo = new Int32Array(n);
  let count = 0;
  for (let i = 0; i < n; i++) if (indeg[i] === 0) topo[count++] = i;
  for (let q = 0; q < count; q++) {
    const v = topo[q];
    for (let k = outStart[v]; k < outStart[v + 1]; k++) {
      const ei = outE[k];
      const w = to[ei];
      if (r[v] + len[ei] > r[w]) r[w] = r[v] + len[ei];
      if (--indeg[w] === 0) topo[count++] = w;
    }
  }

  // Longest-path ranking leaves loosely attached nodes far from their neighbours.
  // Move each node toward the side that has more edges.
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let q = count - 1; q >= 0; q--) {
      const v = topo[q];
      const ins = inStart[v + 1] - inStart[v];
      const outs = outStart[v + 1] - outStart[v];
      if (ins === 0 && outs === 0) continue;
      let lo = -Infinity;
      let hi = Infinity;
      for (let k = inStart[v]; k < inStart[v + 1]; k++) {
        const ei = inE[k];
        lo = Math.max(lo, r[from[ei]] + len[ei]);
      }
      for (let k = outStart[v]; k < outStart[v + 1]; k++) {
        const ei = outE[k];
        hi = Math.min(hi, r[to[ei]] - len[ei]);
      }
      let next = r[v];
      if (outs > ins && hi !== Infinity) next = hi;
      else if (ins > outs && lo !== -Infinity) next = lo;
      if (next !== r[v]) {
        r[v] = next;
        changed = true;
      }
    }
    if (!changed) break;
  }

  let min = Infinity;
  let max = -Infinity;
  let startPorts = false;
  for (let i = 0; i < n; i++) {
    const kind = nodes[i].kind;
    if (kind === Kind.StartPort) startPorts = true;
    if (kind === Kind.StartPort || kind === Kind.EndPort) continue;
    if (r[i] < min) min = r[i];
    if (r[i] > max) max = r[i];
  }
  if (min === Infinity) {
    min = 0;
    max = 0;
  }
  for (let i = 0; i < n; i++) {
    if (nodes[i].kind === Kind.StartPort) r[i] = min - step;
    else if (nodes[i].kind === Kind.EndPort) r[i] = max + step;
  }
  if (startPorts) min -= step;
  for (let i = 0; i < n; i++) nodes[i].rank = r[i] - min;
}

function reduceCrossings(g: Graph, nodes: LNode[]): void {
  const { n, real, maxRank, W, EF, ET, EFD, ETD, succStart, succE, predStart, predE, layerStart, order, pos, offsets } = g;
  let widest = 0;
  for (let r = 0; r <= maxRank; r++) widest = Math.max(widest, layerStart[r + 1] - layerStart[r]);
  // With offsets, edges that reach one node at different offsets take separate places along it.
  const place = offsets ? new Int32Array(EF.length) : undefined;
  let size = 1;
  while (size < (place ? widest + EF.length : widest)) size <<= 1;
  const tree = new Int32Array(2 * size);
  const targets = new Int32Array(EF.length);

  const count = (): number => {
    let total = 0;
    for (let r = 0; r < maxRank; r++) {
      let southLen = layerStart[r + 2] - layerStart[r + 1];
      if (place) {
        let places = 0;
        for (let i = layerStart[r + 1]; i < layerStart[r + 2]; i++) {
          const from = predStart[order[i]];
          const to = predStart[order[i] + 1];
          let mixed = false;
          for (let k = from + 1; k < to; k++) if (ETD[predE[k]] !== ETD[predE[from]]) mixed = true;
          if (mixed) {
            const ids = Array.from(predE.subarray(from, to));
            ids.sort((a, b) => ETD[a] - ETD[b]);
            for (let k = 0; k < ids.length; k++) {
              if (k > 0 && ETD[ids[k]] !== ETD[ids[k - 1]]) places++;
              place[ids[k]] = places;
            }
          } else {
            for (let k = from; k < to; k++) place[predE[k]] = places;
          }
          places++;
        }
        southLen = places;
      }
      if (southLen < 2) continue;
      let t = 0;
      for (let i = layerStart[r]; i < layerStart[r + 1]; i++) {
        const v = order[i];
        const from = succStart[v];
        const to = succStart[v + 1];
        const t0 = t;
        for (let k = from; k < to; k++) targets[t++] = place ? place[succE[k]] : pos[ET[succE[k]]];
        const d = t - t0;
        if (d < 2) continue;
        let mixed = false;
        if (place) for (let k = from + 1; k < to; k++) if (EFD[succE[k]] !== EFD[succE[from]]) mixed = true;
        if (place && mixed) {
          const ids = Array.from(succE.subarray(from, to));
          ids.sort((a, b) => EFD[a] - EFD[b] || place[a] - place[b]);
          for (let k = 0; k < d; k++) targets[t0 + k] = place[ids[k]];
        } else if (d <= 12) {
          for (let a = t0 + 1; a < t; a++) {
            const item = targets[a];
            let b = a - 1;
            while (b >= t0 && targets[b] > item) {
              targets[b + 1] = targets[b];
              b--;
            }
            targets[b + 1] = item;
          }
        } else {
          targets.subarray(t0, t).sort();
        }
      }
      if (t < 2) continue;
      let leaves = 1;
      while (leaves < southLen) leaves <<= 1;
      tree.fill(0, 0, 2 * leaves);
      for (let k = 0; k < t; k++) {
        let i = targets[k] + leaves;
        tree[i]++;
        while (i > 1) {
          if ((i & 1) === 0) total += tree[i + 1];
          i >>= 1;
          tree[i]++;
        }
      }
    }
    return total;
  };

  let best = count();
  if (best === 0) return;
  const bestOrder = order.slice();
  const bary = new Float64Array(n);
  const moving = new Int32Array(widest);
  const leftBias = (a: number, b: number): number => bary[a] - bary[b] || pos[a] - pos[b];
  const rightBias = (a: number, b: number): number => bary[a] - bary[b] || pos[b] - pos[a];

  const sweep = (down: boolean, biasRight: boolean): void => {
    const start = down ? predStart : succStart;
    const list = down ? predE : succE;
    const other = down ? EF : ET;
    const otherDx = down ? EFD : ETD;
    for (let step = 1; step <= maxRank; step++) {
      const r = down ? step : maxRank - step;
      const s = layerStart[r];
      const e = layerStart[r + 1];
      let movable = 0;
      for (let i = s; i < e; i++) {
        const v = order[i];
        const pin = v < real ? nodes[v].pin : 0;
        if (pin !== 0) {
          bary[v] = pin * 1e9;
          moving[movable++] = v;
          continue;
        }
        const from = start[v];
        const to = start[v + 1];
        if (from === to) {
          bary[v] = -1;
          continue;
        }
        let sum = 0;
        for (let k = from; k < to; k++) {
          const u = other[list[k]];
          sum += pos[u];
          if (offsets && W[u] > 0) sum += otherDx[list[k]] / W[u];
        }
        bary[v] = sum / (to - from);
        moving[movable++] = v;
      }
      if (movable < 2) continue;
      moving.subarray(0, movable).sort(biasRight ? rightBias : leftBias);
      let k = 0;
      for (let i = s; i < e; i++) if (bary[order[i]] !== -1) order[i] = moving[k++];
      for (let i = s; i < e; i++) pos[order[i]] = i - s;
    }
  };

  for (let i = 0, stale = 0; stale < 4 && i < MAX_SWEEPS; i++, stale++) {
    sweep(i % 2 === 0, i % 4 >= 2);
    const c = count();
    if (c < best) {
      best = c;
      bestOrder.set(order);
      stale = 0;
      if (c === 0) break;
    }
  }
  order.set(bestOrder);
}

// Brandes-Köpf horizontal coordinate assignment: four aligned layouts, balanced.
function position(g: Graph, opt: LayeredOptions): Float64Array {
  const { n, maxRank, W, KIND, EF, ET, EFD, ETD, succStart, succE, predStart, predE, layerStart, order, pos } = g;
  const segments = EF.length;
  const gap = new Float64Array(n);
  for (let i = 0; i < n; i++) gap[i] = W[i] / 2 + (isDummy(KIND[i]) ? opt.edgeSep : opt.nodeSep) / 2;

  // Neighbours in left-to-right order, so the medians can be read off directly.
  const key = new Int32Array(segments);
  for (let e = 0; e < segments; e++) key[e] = pos[ET[e]];
  for (let v = 0; v < n; v++) if (succStart[v + 1] - succStart[v] > 1) sortRange(succE, succStart[v], succStart[v + 1], key);
  for (let e = 0; e < segments; e++) key[e] = pos[EF[e]];
  for (let v = 0; v < n; v++) if (predStart[v + 1] - predStart[v] > 1) sortRange(predE, predStart[v], predStart[v + 1], key);

  // An edge between two real nodes may not cross a dummy-to-dummy segment; mark those that would.
  const conflict = new Uint8Array(segments);
  for (let r = 1; r <= maxRank; r++) {
    const prevLen = layerStart[r] - layerStart[r - 1];
    const s = layerStart[r];
    const end = layerStart[r + 1];
    let k0 = 0;
    let scan = s;
    for (let i = s; i < end; i++) {
      const v = order[i];
      let inner = -1;
      if (isDummy(KIND[v])) {
        const u = EF[predE[predStart[v]]];
        if (isDummy(KIND[u])) inner = u;
      }
      const k1 = inner >= 0 ? pos[inner] : prevLen;
      if (inner >= 0 || i === end - 1) {
        for (let j = scan; j <= i; j++) {
          const w = order[j];
          const wDummy = isDummy(KIND[w]);
          for (let k = predStart[w]; k < predStart[w + 1]; k++) {
            const e = predE[k];
            const up = pos[EF[e]];
            if ((up < k0 || k1 < up) && !(wDummy && isDummy(KIND[EF[e]]))) conflict[e] = 1;
          }
        }
        scan = i + 1;
        k0 = k1;
      }
    }
  }

  const results: Float64Array[] = [];
  const root = new Int32Array(n);
  const align = new Int32Array(n);
  // Offset of each node from its block's root, so that aligned edges meet at their attachment points.
  const shift = new Float64Array(n);
  const eFrom = new Int32Array(n);
  const eTo = new Int32Array(n);
  const eW = new Float64Array(n);
  const indeg = new Int32Array(n);
  const outStart = new Int32Array(n + 1);
  const outE = new Int32Array(n);
  const fill = new Int32Array(n);
  const topo = new Int32Array(n);

  for (let variant = 0; variant < 4; variant++) {
    const up = variant < 2;
    const right = (variant & 1) === 1;
    const start = up ? predStart : succStart;
    const list = up ? predE : succE;
    const other = up ? EF : ET;
    const ownDx = up ? ETD : EFD;
    const otherDx = up ? EFD : ETD;
    for (let i = 0; i < n; i++) {
      root[i] = i;
      align[i] = i;
      shift[i] = 0;
    }

    for (let step = 0; step <= maxRank; step++) {
      const r = up ? step : maxRank - step;
      const s = layerStart[r];
      const end = layerStart[r + 1];
      const adjacent = up ? r - 1 : r + 1;
      const adjacentLast = adjacent >= 0 && adjacent <= maxRank ? layerStart[adjacent + 1] - layerStart[adjacent] - 1 : 0;
      let prevIdx = -1;
      for (let i = right ? end - 1 : s; right ? i >= s : i < end; right ? i-- : i++) {
        const v = order[i];
        const from = start[v];
        const d = start[v + 1] - from;
        if (d === 0) continue;
        const lo = from + ((d - 1) >> 1);
        const hi = from + (d >> 1);
        for (let pass = 0; pass < 2; pass++) {
          if (pass === 1 && lo === hi) break;
          const e = list[(pass === 0) !== right ? lo : hi];
          const w = other[e];
          const idx = right ? adjacentLast - pos[w] : pos[w];
          if (align[v] === v && prevIdx < idx && conflict[e] === 0) {
            align[w] = v;
            align[v] = root[v] = root[w];
            shift[v] = shift[w] + otherDx[e] - ownDx[e];
            prevIdx = idx;
          }
        }
      }
    }

    let blockEdges = 0;
    indeg.fill(0);
    outStart.fill(0);
    for (let r = 0; r <= maxRank; r++) {
      const s = layerStart[r];
      const end = layerStart[r + 1];
      for (let i = s + 1; i < end; i++) {
        const a = right ? order[i] : order[i - 1];
        const b = right ? order[i - 1] : order[i];
        const sep = gap[a] + gap[b];
        eFrom[blockEdges] = root[a];
        eTo[blockEdges] = root[b];
        eW[blockEdges] = right ? sep - shift[a] + shift[b] : sep + shift[a] - shift[b];
        indeg[root[b]]++;
        outStart[root[a] + 1]++;
        blockEdges++;
      }
    }
    for (let i = 0; i < n; i++) outStart[i + 1] += outStart[i];
    fill.set(outStart.subarray(0, n));
    for (let e = 0; e < blockEdges; e++) outE[fill[eFrom[e]]++] = e;

    const x = new Float64Array(n);
    let count = 0;
    for (let i = 0; i < n; i++) if (root[i] === i && indeg[i] === 0) topo[count++] = i;
    for (let q = 0; q < count; q++) {
      const v = topo[q];
      for (let k = outStart[v]; k < outStart[v + 1]; k++) {
        const e = outE[k];
        const w = eTo[e];
        if (x[v] + eW[e] > x[w]) x[w] = x[v] + eW[e];
        if (--indeg[w] === 0) topo[count++] = w;
      }
    }
    for (let q = count - 1; q >= 0; q--) {
      const v = topo[q];
      let min = Infinity;
      for (let k = outStart[v]; k < outStart[v + 1]; k++) {
        const e = outE[k];
        const cand = x[eTo[e]] - eW[e];
        if (cand < min) min = cand;
      }
      if (min !== Infinity && min > x[v]) x[v] = min;
    }
    const xs = new Float64Array(n);
    for (let i = 0; i < n; i++) xs[i] = (right ? -x[root[i]] : x[root[i]]) + shift[i];
    results.push(xs);
  }

  let narrowest = 0;
  let bestWidth = Infinity;
  const mins: number[] = [];
  const maxs: number[] = [];
  for (let k = 0; k < 4; k++) {
    let lo = Infinity;
    let hi = -Infinity;
    const xs = results[k];
    for (let i = 0; i < n; i++) {
      const half = W[i] / 2;
      if (xs[i] - half < lo) lo = xs[i] - half;
      if (xs[i] + half > hi) hi = xs[i] + half;
    }
    mins.push(lo);
    maxs.push(hi);
    if (hi - lo < bestWidth) {
      bestWidth = hi - lo;
      narrowest = k;
    }
  }
  for (let k = 0; k < 4; k++) {
    const delta = (k & 1) === 0 ? mins[narrowest] - mins[k] : maxs[narrowest] - maxs[k];
    if (delta !== 0) {
      const xs = results[k];
      for (let i = 0; i < n; i++) xs[i] += delta;
    }
  }

  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let a = results[0][i];
    let b = results[1][i];
    let c = results[2][i];
    let d = results[3][i];
    let t: number;
    if (a > b) (t = a), (a = b), (b = t);
    if (c > d) (t = c), (c = d), (d = t);
    if (a > c) (t = a), (a = c), (c = t);
    if (b > d) (t = b), (b = d), (d = t);
    if (b > c) (t = b), (b = c), (c = t);
    out[i] = (b + c) / 2;
  }
  return out;
}
