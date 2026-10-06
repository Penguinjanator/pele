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
  order: number;
}

export interface LEdge {
  tail: number;
  head: number;
  minlen: number;
  weight: number;
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
  return { w, h, kind, pin: 0, x: 0, y: 0, rank: 0, order: 0 };
}

export function ledge(tail: number, head: number, minlen = 1, labelW = 0, labelH = 0): LEdge {
  return {
    tail,
    head,
    minlen,
    weight: 1,
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

export function layered(nodes: LNode[], edges: LEdge[], opt: LayeredOptions): LayeredResult {
  const realCount = nodes.length;
  if (realCount === 0) return { width: 0, height: 0 };
  const m = edges.length;

  // Every edge gets a middle rank of its own when labels or parallel edges need the room.
  let step = 1;
  if (m > 0) {
    const seen = new Set<number>();
    for (const e of edges) {
      const a = Math.min(e.tail, e.head);
      const b = Math.max(e.tail, e.head);
      const key = a * realCount + b;
      if (e.labelW > 0 || seen.has(key)) {
        step = 2;
        break;
      }
      seen.add(key);
    }
  }

  orient(nodes, edges);
  rank(nodes, edges, step);

  const chains: number[][] = new Array(m);
  const preds: number[][] = [];
  const succs: number[][] = [];
  const predOff: number[][] = [];
  const succOff: number[][] = [];
  for (let i = 0; i < realCount; i++) {
    preds.push([]);
    succs.push([]);
    predOff.push([]);
    succOff.push([]);
  }
  const labelNode = new Int32Array(m).fill(-1);

  for (let ei = 0; ei < m; ei++) {
    const e = edges[ei];
    const a = e.reversed ? e.head : e.tail;
    const b = e.reversed ? e.tail : e.head;
    const aDx = e.reversed ? e.headDx : e.tailDx;
    const bDx = e.reversed ? e.tailDx : e.headDx;
    const ra = nodes[a].rank;
    const rb = nodes[b].rank;
    const chain = [a];
    let labelRank = -1;
    if (e.labelW > 0) {
      labelRank = ra + ((rb - ra) >> 1);
      if (step === 2 && (labelRank & 1) === 0) labelRank--;
    }
    for (let r = ra + 1; r < rb; r++) {
      const isLabel = r === labelRank;
      const d = lnode(isLabel ? e.labelW : 0, isLabel ? e.labelH : 0, isLabel ? Kind.Label : Kind.Dummy);
      d.rank = r;
      const id = nodes.length;
      nodes.push(d);
      preds.push([]);
      succs.push([]);
      predOff.push([]);
      succOff.push([]);
      if (isLabel) labelNode[ei] = id;
      chain.push(id);
    }
    chain.push(b);
    chains[ei] = chain;
    for (let k = 0; k + 1 < chain.length; k++) {
      const u = chain[k];
      const v = chain[k + 1];
      succs[u].push(v);
      succOff[u].push(k === 0 && nodes[a].w > 0 ? aDx / nodes[a].w : 0);
      preds[v].push(u);
      predOff[v].push(k === chain.length - 2 && nodes[b].w > 0 ? bDx / nodes[b].w : 0);
    }
  }

  const n = nodes.length;
  let maxRank = 0;
  for (const node of nodes) if (node.rank > maxRank) maxRank = node.rank;
  const layers: number[][] = [];
  for (let r = 0; r <= maxRank; r++) layers.push([]);

  // Initial order: depth-first from the top so that subtrees start out contiguous.
  {
    const visited = new Uint8Array(n);
    const byRank: number[] = [];
    for (let i = 0; i < n; i++) byRank.push(i);
    byRank.sort((p, q) => nodes[p].rank - nodes[q].rank || p - q);
    const stack: number[] = [];
    for (const start of byRank) {
      if (visited[start]) continue;
      stack.push(start);
      while (stack.length > 0) {
        const v = stack.pop()!;
        if (visited[v]) continue;
        visited[v] = 1;
        layers[nodes[v].rank].push(v);
        const out = succs[v];
        for (let k = out.length - 1; k >= 0; k--) if (!visited[out[k]]) stack.push(out[k]);
      }
    }
  }
  const pos = new Int32Array(n);
  const setPositions = (): void => {
    for (const layer of layers) for (let i = 0; i < layer.length; i++) pos[layer[i]] = i;
  };
  applyPins(nodes, layers);
  setPositions();

  if (m > 0 && maxRank > 0) reduceCrossings(nodes, layers, pos, preds, succs, predOff, succOff, setPositions);

  for (const layer of layers) for (let i = 0; i < layer.length; i++) nodes[layer[i]].order = i;

  const xs = position(nodes, layers, pos, preds, succs, opt);

  const bandTop = new Float64Array(maxRank + 1);
  const bandBottom = new Float64Array(maxRank + 1);
  // Ranks that hold only border ports or their pass-through dummies need little room of their own.
  const portOnly = (r: number, kind: Kind): boolean => {
    let found = false;
    for (const v of layers[r]) {
      if (nodes[v].kind === kind) found = true;
      else if (nodes[v].kind !== Kind.Dummy) return false;
    }
    return found;
  };
  const startRanks = portOnly(0, Kind.StartPort) ? step : 0;
  const endRanks = portOnly(maxRank, Kind.EndPort) ? step : 0;
  let y = 0;
  for (let r = 0; r <= maxRank; r++) {
    let h = 0;
    for (const v of layers[r]) if (nodes[v].h > h) h = nodes[v].h;
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
    const half = nodes[i].w / 2;
    if (xs[i] - half < minX) minX = xs[i] - half;
    if (xs[i] + half > maxX) maxX = xs[i] + half;
  }
  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    node.x = xs[i] - minX;
    node.y = (bandTop[node.rank] + bandBottom[node.rank]) / 2;
  }

  for (let ei = 0; ei < m; ei++) {
    const e = edges[ei];
    const chain = chains[ei];
    const first = nodes[chain[0]];
    const last = nodes[chain[chain.length - 1]];
    const pts: number[] = [first.x + (e.reversed ? e.headDx : e.tailDx), first.y + first.h / 2];
    for (let k = 1; k + 1 < chain.length; k++) {
      const d = nodes[chain[k]];
      const top = bandTop[d.rank];
      const bottom = bandBottom[d.rank];
      pts.push(d.x, top);
      if (bottom > top) pts.push(d.x, bottom);
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
      e.labelX = nodes[ln].x;
      e.labelY = nodes[ln].y;
    }
  }

  nodes.length = realCount;
  return { width: maxX - minX, height };
}

// Reverses the edges that close a cycle, found by depth-first search in declaration order.
export function orient(nodes: LNode[], edges: LEdge[]): void {
  const n = nodes.length;
  const out: number[][] = [];
  for (let i = 0; i < n; i++) out.push([]);
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    e.reversed = false;
    if (nodes[e.head].kind === Kind.StartPort || nodes[e.tail].kind === Kind.EndPort) e.reversed = true;
    else out[e.tail].push(i);
  }
  const state = new Uint8Array(n);
  const stackNode: number[] = [];
  const stackEdge: number[] = [];
  for (let start = 0; start < n; start++) {
    if (state[start] !== 0) continue;
    stackNode.push(start);
    stackEdge.push(0);
    state[start] = 1;
    while (stackNode.length > 0) {
      const top = stackNode.length - 1;
      const v = stackNode[top];
      const k = stackEdge[top];
      if (k < out[v].length) {
        stackEdge[top] = k + 1;
        const e = edges[out[v][k]];
        const w = e.head;
        if (state[w] === 1) e.reversed = true;
        else if (state[w] === 0) {
          state[w] = 1;
          stackNode.push(w);
          stackEdge.push(0);
        }
      } else {
        state[v] = 2;
        stackNode.pop();
        stackEdge.pop();
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
  const inList: number[][] = [];
  const outList: number[][] = [];
  const indeg = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    inList.push([]);
    outList.push([]);
  }
  for (let i = 0; i < m; i++) {
    const e = edges[i];
    const a = e.reversed ? e.head : e.tail;
    const b = e.reversed ? e.tail : e.head;
    from[i] = a;
    to[i] = b;
    len[i] = Math.max(1, e.minlen) * step;
    outList[a].push(i);
    inList[b].push(i);
    indeg[b]++;
  }

  const r = new Int32Array(n);
  const topo: number[] = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) topo.push(i);
  for (let q = 0; q < topo.length; q++) {
    const v = topo[q];
    for (const ei of outList[v]) {
      const w = to[ei];
      if (r[v] + len[ei] > r[w]) r[w] = r[v] + len[ei];
      if (--indeg[w] === 0) topo.push(w);
    }
  }

  // Longest-path ranking leaves loosely attached nodes far from their neighbours.
  // Move each node toward the side that carries more edge weight.
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let q = topo.length - 1; q >= 0; q--) {
      const v = topo[q];
      const ins = inList[v];
      const outs = outList[v];
      if (ins.length === 0 && outs.length === 0) continue;
      let lo = -Infinity;
      let hi = Infinity;
      let inW = 0;
      let outW = 0;
      for (const ei of ins) {
        lo = Math.max(lo, r[from[ei]] + len[ei]);
        inW += edges[ei].weight;
      }
      for (const ei of outs) {
        hi = Math.min(hi, r[to[ei]] - len[ei]);
        outW += edges[ei].weight;
      }
      let next = r[v];
      if (outW > inW && hi !== Infinity) next = hi;
      else if (inW > outW && lo !== -Infinity) next = lo;
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

function applyPins(nodes: LNode[], layers: number[][]): void {
  for (const layer of layers) {
    let pinned = false;
    for (const v of layer) if (nodes[v].pin !== 0) pinned = true;
    if (!pinned) continue;
    const index = new Map<number, number>();
    layer.forEach((v, i) => index.set(v, i));
    layer.sort((a, b) => nodes[a].pin - nodes[b].pin || index.get(a)! - index.get(b)!);
  }
}

function countCrossings(layers: number[][], pos: Int32Array, succs: number[][], succOff: number[][]): number {
  let total = 0;
  for (let r = 0; r + 1 < layers.length; r++) {
    const north = layers[r];
    const south = layers[r + 1];
    if (north.length === 0 || south.length < 2) continue;
    const targets: number[] = [];
    for (const v of north) {
      const out = succs[v];
      if (out.length === 1) {
        targets.push(pos[out[0]]);
      } else if (out.length > 1) {
        const off = succOff[v];
        const idx: number[] = [];
        for (let i = 0; i < out.length; i++) idx.push(i);
        idx.sort((a, b) => off[a] - off[b] || pos[out[a]] - pos[out[b]]);
        for (const i of idx) targets.push(pos[out[i]]);
      }
    }
    if (targets.length < 2) continue;
    let size = 1;
    while (size < south.length) size <<= 1;
    const tree = new Int32Array(2 * size);
    for (const t of targets) {
      let i = t + size;
      tree[i]++;
      while (i > 1) {
        if ((i & 1) === 0) total += tree[i + 1];
        i >>= 1;
        tree[i]++;
      }
    }
  }
  return total;
}

function reduceCrossings(
  nodes: LNode[],
  layers: number[][],
  pos: Int32Array,
  preds: number[][],
  succs: number[][],
  predOff: number[][],
  succOff: number[][],
  setPositions: () => void
): void {
  let best = countCrossings(layers, pos, succs, succOff);
  if (best === 0) return;
  let bestLayers = layers.map((l) => l.slice());
  const n = nodes.length;
  const bary = new Float64Array(n);

  let offsets = false;
  for (const list of succOff) for (const off of list) if (off !== 0) offsets = true;
  for (const list of predOff) for (const off of list) if (off !== 0) offsets = true;

  const sweep = (down: boolean, biasRight: boolean): void => {
    const adj = down ? preds : succs;
    const other = down ? succs : preds;
    const otherOff = down ? succOff : predOff;
    const count = layers.length;
    for (let step = 1; step < count; step++) {
      const layer = layers[down ? step : count - 1 - step];
      let movable = 0;
      for (const v of layer) {
        const pin = nodes[v].pin;
        if (pin !== 0) {
          bary[v] = pin * 1e9;
          movable++;
          continue;
        }
        const nb = adj[v];
        if (nb.length === 0) {
          bary[v] = -1;
          continue;
        }
        let sum = 0;
        for (const u of nb) {
          sum += pos[u];
          if (offsets && other[u].length > 1) sum += otherOff[u][other[u].indexOf(v)];
        }
        bary[v] = sum / nb.length;
        movable++;
      }
      if (movable < 2) continue;
      const moving: number[] = [];
      for (const v of layer) if (bary[v] !== -1) moving.push(v);
      if (biasRight) moving.sort((a, b) => bary[a] - bary[b] || pos[b] - pos[a]);
      else moving.sort((a, b) => bary[a] - bary[b] || pos[a] - pos[b]);
      let k = 0;
      for (let i = 0; i < layer.length; i++) {
        if (bary[layer[i]] !== -1) layer[i] = moving[k++];
      }
      for (let i = 0; i < layer.length; i++) pos[layer[i]] = i;
    }
  };

  for (let i = 0, stale = 0; stale < 4 && i < MAX_SWEEPS; i++, stale++) {
    sweep(i % 2 === 0, i % 4 >= 2);
    const c = countCrossings(layers, pos, succs, succOff);
    if (c < best) {
      best = c;
      bestLayers = layers.map((l) => l.slice());
      stale = 0;
      if (c === 0) break;
    }
  }
  for (let r = 0; r < layers.length; r++) layers[r] = bestLayers[r];
  setPositions();
}

// Brandes-Köpf horizontal coordinate assignment: four aligned layouts, balanced.
function position(
  nodes: LNode[],
  layers: number[][],
  pos: Int32Array,
  preds: number[][],
  succs: number[][],
  opt: LayeredOptions
): Float64Array {
  const n = nodes.length;
  const isDummy = (v: number): boolean => nodes[v].kind === Kind.Dummy || nodes[v].kind === Kind.Label;
  const sep = (u: number, v: number): number =>
    nodes[u].w / 2 +
    (isDummy(u) ? opt.edgeSep : opt.nodeSep) / 2 +
    (isDummy(v) ? opt.edgeSep : opt.nodeSep) / 2 +
    nodes[v].w / 2;

  // An edge between two real nodes may not cross a dummy-to-dummy segment; mark those that would.
  const conflicts = new Set<number>();
  for (let r = 1; r < layers.length; r++) {
    const prev = layers[r - 1];
    const layer = layers[r];
    let k0 = 0;
    let scan = 0;
    for (let i = 0; i < layer.length; i++) {
      const v = layer[i];
      let inner = -1;
      if (isDummy(v)) {
        for (const u of preds[v]) if (isDummy(u)) inner = u;
      }
      const k1 = inner >= 0 ? pos[inner] : prev.length;
      if (inner >= 0 || i === layer.length - 1) {
        for (let j = scan; j <= i; j++) {
          const s = layer[j];
          for (const u of preds[s]) {
            const up = pos[u];
            if ((up < k0 || k1 < up) && !(isDummy(u) && isDummy(s))) conflicts.add(u * n + s);
          }
        }
        scan = i + 1;
        k0 = k1;
      }
    }
  }
  const hasConflict = (u: number, v: number): boolean => conflicts.has(u * n + v) || conflicts.has(v * n + u);

  const results: Float64Array[] = [];
  const root = new Int32Array(n);
  const align = new Int32Array(n);
  const lpos = new Int32Array(n);
  const count = layers.length;

  for (let variant = 0; variant < 4; variant++) {
    const up = variant < 2;
    const right = (variant & 1) === 1;
    const neighbors = up ? preds : succs;
    for (let i = 0; i < n; i++) {
      root[i] = i;
      align[i] = i;
    }
    const ordered: number[][] = [];
    for (let k = 0; k < count; k++) {
      const layer = layers[up ? k : count - 1 - k];
      const seq = right ? layer.slice().reverse() : layer;
      ordered.push(seq);
      for (let i = 0; i < seq.length; i++) lpos[seq[i]] = i;
    }

    for (const layer of ordered) {
      let prevIdx = -1;
      for (const v of layer) {
        const ws = neighbors[v];
        if (ws.length === 0) continue;
        const sorted = ws.length === 1 ? ws : ws.slice().sort((a, b) => lpos[a] - lpos[b]);
        const mid = (sorted.length - 1) / 2;
        for (let i = Math.floor(mid), end = Math.ceil(mid); i <= end; i++) {
          const w = sorted[i];
          if (align[v] === v && prevIdx < lpos[w] && !hasConflict(v, w)) {
            align[w] = v;
            align[v] = root[v] = root[w];
            prevIdx = lpos[w];
          }
        }
      }
    }

    const eFrom: number[] = [];
    const eTo: number[] = [];
    const eW: number[] = [];
    const indeg = new Int32Array(n);
    const outCount = new Int32Array(n + 1);
    for (const layer of ordered) {
      for (let i = 1; i < layer.length; i++) {
        const u = layer[i - 1];
        const v = layer[i];
        eFrom.push(root[u]);
        eTo.push(root[v]);
        eW.push(right ? sep(v, u) : sep(u, v));
        indeg[root[v]]++;
        outCount[root[u] + 1]++;
      }
    }
    for (let i = 0; i < n; i++) outCount[i + 1] += outCount[i];
    const fill = outCount.slice(0, n);
    const outEdges = new Int32Array(eFrom.length);
    for (let i = 0; i < eFrom.length; i++) outEdges[fill[eFrom[i]]++] = i;

    const x = new Float64Array(n);
    const topo: number[] = [];
    for (let i = 0; i < n; i++) if (root[i] === i && indeg[i] === 0) topo.push(i);
    for (let q = 0; q < topo.length; q++) {
      const v = topo[q];
      for (let k = outCount[v]; k < outCount[v + 1]; k++) {
        const ei = outEdges[k];
        const w = eTo[ei];
        if (x[v] + eW[ei] > x[w]) x[w] = x[v] + eW[ei];
        if (--indeg[w] === 0) topo.push(w);
      }
    }
    for (let q = topo.length - 1; q >= 0; q--) {
      const v = topo[q];
      let min = Infinity;
      for (let k = outCount[v]; k < outCount[v + 1]; k++) {
        const ei = outEdges[k];
        const cand = x[eTo[ei]] - eW[ei];
        if (cand < min) min = cand;
      }
      if (min !== Infinity && min > x[v]) x[v] = min;
    }
    const xs = new Float64Array(n);
    for (let i = 0; i < n; i++) xs[i] = right ? -x[root[i]] : x[root[i]];
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
      const half = nodes[i].w / 2;
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
