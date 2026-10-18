import { Kind, ease, layered, ledge, lnode, orient, rank, type LEdge, type LNode, type LayeredOptions } from './layered.js';

export type Dir = 'TB' | 'BT' | 'LR' | 'RL';

// The direction a diagram names, or top to bottom for anything else.
export function direction(dir: string | undefined): Dir {
  return dir === 'BT' || dir === 'LR' || dir === 'RL' ? dir : 'TB';
}

export interface CNode {
  w: number;
  h: number;
  parent: number;
  isGroup: boolean;
  dir: Dir | undefined;
  padX: number;
  padTop: number;
  padBottom: number;
  minW: number;
  // Declaration order; a group takes the smallest value among its members.
  seq: number;
  // How much of a side its edges may spread along, measured across the flow; 0 keeps them at its middle.
  span: number;
  x: number;
  y: number;
}

export interface CEdge {
  src: number;
  dst: number;
  minlen: number;
  labelW: number;
  labelH: number;
  // x, y, axis triples; axis is 0 where the edge runs vertically into the point, 1 horizontally.
  route: number[];
  labelX: number;
  labelY: number;
}

export interface CompoundResult {
  width: number;
  height: number;
}

const enum Side {
  Top,
  Right,
  Bottom,
  Left,
}

interface PortEdge {
  e: number;
  inner: number;
  out: boolean;
  side: Side;
  // Where, across the flow, the edge goes on outside the group, from an earlier layout. NaN for unknown.
  hint: number;
  px: number;
  py: number;
  route: number[];
}

interface LevelEdge {
  e: number;
  a: number;
  b: number;
}

interface Level {
  id: number;
  dir: Dir;
  items: number[];
  edges: LevelEdge[];
  ports: PortEdge[];
  portOf: Map<number, PortEdge>;
  routes: Map<number, number[]>;
  x: number;
  y: number;
}

const MAX_PORTS = 40000;

// The largest drawings whose groups are given an order from a layout of the whole drawing, and
// are laid out again to bring the ports on their borders into a better order.
const MAX_ORDERED_PORTS = 400;
const MAX_ORDERED_EDGES = 500;
// How much more the groups may cross, laid out in the order of the flat layout, than the flat
// layout did, before their own order is tried as well.
const FLAT_SLACK = 1.5;
const FLAT_SPARE = 4;

// What a layout leaves behind, to go back to when another try turns out worse.
interface Snapshot {
  nodes: number[];
  routes: number[][];
  labels: number[];
  levels: number[];
  total: CompoundResult;
}

function snapshot(nodes: CNode[], edges: CEdge[], levels: Level[], total: CompoundResult): Snapshot {
  const at: number[] = [];
  for (const c of nodes) at.push(c.x, c.y, c.w, c.h);
  const labels: number[] = [];
  for (const e of edges) labels.push(e.labelX, e.labelY);
  const places: number[] = [];
  for (const level of levels) {
    places.push(level.x, level.y);
    for (const port of level.ports) places.push(port.px, port.py);
  }
  return { nodes: at, routes: edges.map((e) => e.route), labels, levels: places, total };
}

function restore(s: Snapshot, nodes: CNode[], edges: CEdge[], levels: Level[]): CompoundResult {
  nodes.forEach((c, i) => {
    c.x = s.nodes[4 * i];
    c.y = s.nodes[4 * i + 1];
    c.w = s.nodes[4 * i + 2];
    c.h = s.nodes[4 * i + 3];
  });
  edges.forEach((e, i) => {
    e.route = s.routes[i];
    e.labelX = s.labels[2 * i];
    e.labelY = s.labels[2 * i + 1];
  });
  let k = 0;
  for (const level of levels) {
    level.x = s.levels[k++];
    level.y = s.levels[k++];
    for (const port of level.ports) {
      port.px = s.levels[k++];
      port.py = s.levels[k++];
    }
  }
  return s.total;
}

// How often the routes of edges cross, taking each as straight lines between its points. Where
// two edges meet at one node, they are not counted as crossing near it, where they fan out.
const FAN = 24;
// How far out of line two points may be and still count as in line.
const IN_LINE = 0.5;
const CURVE_PIECES = 4;
export function routeCrossings(nodes: CNode[], edges: CEdge[]): number {
  const ax: number[] = [];
  const ay: number[] = [];
  const bx: number[] = [];
  const by: number[] = [];
  const owner: number[] = [];
  // 1 for a piece of the first part of a route, 2 for one of the last.
  const ends: number[] = [];
  edges.forEach((e, ei) => {
    if (e.src === e.dst) return;
    const r = e.route;
    let part = 0;
    const add = (x0: number, y0: number, x1: number, y1: number): void => {
      ends.push(part);
      ax.push(Math.min(x0, x1));
      bx.push(Math.max(x0, x1));
      ay.push(x0 <= x1 ? y0 : y1);
      by.push(x0 <= x1 ? y1 : y0);
      owner.push(ei);
    };
    for (let k = 3; k < r.length; k += 3) {
      part = (k === 3 ? 1 : 0) | (k === r.length - 3 ? 2 : 0);
      const x0 = r[k - 3];
      const y0 = r[k - 2];
      const x1 = r[k];
      const y1 = r[k + 1];
      if (Math.abs(x1 - x0) < 0.01 || Math.abs(y1 - y0) < 0.01) {
        add(x0, y0, x1, y1);
        continue;
      }
      // An S along the flow, as the drawing has it, in a few straight pieces.
      const down = r[k + 2] === 0;
      const c = down ? ease(x1 - x0, y1 - y0) : ease(y1 - y0, x1 - x0);
      let px = x0;
      let py = y0;
      for (let i = 1; i <= CURVE_PIECES; i++) {
        const t = i / CURVE_PIECES;
        const u = 1 - t;
        const across = t * t * (3 - 2 * t);
        const along = 3 * c * t * u * u + 3 * (1 - c) * t * t * u + t * t * t;
        const x = x0 + (x1 - x0) * (down ? across : along);
        const y = y0 + (y1 - y0) * (down ? along : across);
        add(px, py, x, y);
        px = x;
        py = y;
      }
    }
  });
  const near = (v: number, x: number, y: number): boolean => Math.abs(x - nodes[v].x) < nodes[v].w / 2 + FAN && Math.abs(y - nodes[v].y) < nodes[v].h / 2 + FAN;
  const ids = Int32Array.from(ax, (_, i) => i).sort((p, q) => ax[p] - ax[q] || p - q);
  const count = ids.length;
  const left = new Float64Array(count);
  const right = new Float64Array(count);
  const low = new Float64Array(count);
  const high = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const p = ids[i];
    left[i] = ax[p];
    right[i] = bx[p];
    low[i] = Math.min(ay[p], by[p]);
    high[i] = Math.max(ay[p], by[p]);
  }
  let total = 0;
  for (let i = 0; i < count; i++) {
    const p = ids[i];
    const dx = bx[p] - ax[p];
    const dy = by[p] - ay[p];
    for (let j = i + 1; j < count && left[j] <= right[i]; j++) {
      if (high[j] < low[i] || low[j] > high[i]) continue;
      const q = ids[j];
      if (owner[p] === owner[q]) continue;
      const d1 = dx * (ay[q] - ay[p]) - dy * (ax[q] - ax[p]);
      const d2 = dx * (by[q] - ay[p]) - dy * (bx[q] - ax[p]);
      // A point that lies on the other line counts as on one side of it, so that a crossing at
      // the end of one piece is counted once, in one of the two pieces it joins.
      if (d1 > 0 === (d2 > 0)) continue;
      const ex = bx[q] - ax[q];
      const ey = by[q] - ay[q];
      const d3 = ex * (ay[p] - ay[q]) - ey * (ax[p] - ax[q]);
      const d4 = ex * (by[p] - ay[q]) - ey * (bx[p] - ax[q]);
      if (d3 > 0 === (d4 > 0)) continue;
      const ep = edges[owner[p]];
      const eq = edges[owner[q]];
      const t = d3 / (d3 - d4);
      const x = ax[p] + t * dx;
      const y = ay[p] + t * dy;
      // Where two edges meet at a node, the parts of them that lead to it fan in.
      const fan = (v: number, pe: number, qe: number): boolean => near(v, x, y) || ((ends[p] & pe) !== 0 && (ends[q] & qe) !== 0);
      if (ep.src === eq.src && fan(ep.src, 1, 1)) continue;
      if (ep.src === eq.dst && fan(ep.src, 1, 2)) continue;
      if (ep.dst === eq.src && fan(ep.dst, 2, 1)) continue;
      if (ep.dst === eq.dst && fan(ep.dst, 2, 2)) continue;
      total++;
    }
  }
  return total;
}

export function shiftLayout(nodes: CNode[], edges: CEdge[], ox: number, oy: number): void {
  for (const c of nodes) {
    c.x += ox;
    c.y += oy;
  }
  for (const e of edges) {
    for (let k = 0; k < e.route.length; k += 3) {
      e.route[k] += ox;
      e.route[k + 1] += oy;
    }
    e.labelX += ox;
    e.labelY += oy;
  }
}

export function cnode(w: number, h: number, parent = -1): CNode {
  return { w, h, parent, isGroup: false, dir: undefined, padX: 0, padTop: 0, padBottom: 0, minW: 0, seq: 0, span: 0, x: 0, y: 0 };
}

function startSide(dir: Dir): Side {
  return dir === 'TB' ? Side.Top : dir === 'BT' ? Side.Bottom : dir === 'LR' ? Side.Left : Side.Right;
}

function opposite(side: Side): Side {
  return ((side + 2) & 3) as Side;
}

// Lays out a graph whose nodes may be nested in groups. Each group is laid out on its own,
// in its own direction, and then placed in its parent as a single box. An edge that crosses
// a group's border passes through a port on the side facing its other end.
export function compoundLayout(nodes: CNode[], edges: CEdge[], rootDir: Dir, opt: LayeredOptions): CompoundResult {
  const n = nodes.length;
  const levelOf = new Map<number, Level>();
  const order: Level[] = [];
  const makeLevel = (id: number, dir: Dir): Level => {
    const level: Level = { id, dir, items: [], edges: [], ports: [], portOf: new Map(), routes: new Map(), x: 0, y: 0 };
    levelOf.set(id, level);
    return level;
  };
  const root = makeLevel(-1, rootDir);

  const children: number[][] = [];
  for (let i = 0; i < n; i++) children.push([]);
  const rootItems: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = nodes[i].parent;
    if (p >= 0 && p < n && p !== i && nodes[p].isGroup) children[p].push(i);
    else {
      nodes[i].parent = -1;
      rootItems.push(i);
    }
  }
  root.items = rootItems;
  order.push(root);
  const depth = new Int32Array(n);
  const placed = new Uint8Array(n);
  const descend = (from: number): void => {
    for (let q = from; q < order.length; q++) {
      const level = order[q];
      for (const item of level.items) {
        placed[item] = 1;
        depth[item] = level.id < 0 ? 0 : depth[level.id] + 1;
        if (nodes[item].isGroup) {
          const child = makeLevel(item, nodes[item].dir ?? level.dir);
          child.items = children[item];
          order.push(child);
        }
      }
    }
  };
  descend(0);
  // Groups that contain each other are unreachable from the root; lift them out.
  for (let i = 0; i < n; i++) {
    if (placed[i]) continue;
    const former = nodes[i].parent;
    children[former] = children[former].filter((c) => c !== i);
    nodes[i].parent = -1;
    root.items.push(i);
    placed[i] = 1;
    depth[i] = 0;
    if (nodes[i].isGroup) {
      const from = order.length;
      const child = makeLevel(i, nodes[i].dir ?? rootDir);
      child.items = children[i];
      order.push(child);
      descend(from);
    }
  }

  for (let q = order.length - 1; q > 0; q--) {
    const level = order[q];
    let seq = Infinity;
    for (const item of level.items) if (nodes[item].seq < seq) seq = nodes[item].seq;
    if (seq !== Infinity) nodes[level.id].seq = seq;
  }
  for (const level of order) level.items.sort((a, b) => nodes[a].seq - nodes[b].seq || a - b);

  // Every group border an edge crosses costs a port. Past the budget, an edge is drawn between
  // the groups that hold its ends, at the level they share.
  let ports = 0;
  for (const e of edges) {
    let a = e.src;
    let b = e.dst;
    let crossed = 0;
    for (; depth[a] > depth[b]; crossed++) a = nodes[a].parent;
    for (; depth[b] > depth[a]; crossed++) b = nodes[b].parent;
    for (; a !== b && nodes[a].parent !== nodes[b].parent; crossed += 2) {
      a = nodes[a].parent;
      b = nodes[b].parent;
    }
    if (a === b) continue;
    if (ports + crossed > MAX_PORTS) {
      e.src = a;
      e.dst = b;
    } else {
      ports += crossed;
    }
  }

  const loops: number[] = [];
  const stray: number[] = [];
  for (let ei = 0; ei < edges.length; ei++) {
    const e = edges[ei];
    e.route = [];
    if (e.src === e.dst) {
      loops.push(ei);
      continue;
    }
    let a = e.src;
    let b = e.dst;
    const aPath: number[] = [];
    const bPath: number[] = [];
    while (depth[a] > depth[b]) {
      aPath.push(a);
      a = nodes[a].parent;
    }
    while (depth[b] > depth[a]) {
      bPath.push(b);
      b = nodes[b].parent;
    }
    if (a === b) {
      stray.push(ei);
      continue;
    }
    while (nodes[a].parent !== nodes[b].parent) {
      aPath.push(a);
      bPath.push(b);
      a = nodes[a].parent;
      b = nodes[b].parent;
    }
    levelOf.get(nodes[a].parent)!.edges.push({ e: ei, a, b });
    for (const [path, out] of [
      [aPath, true],
      [bPath, false],
    ] as const) {
      for (const inner of path) {
        const level = levelOf.get(nodes[inner].parent)!;
        const port: PortEdge = { e: ei, inner, out, side: Side.Top, hint: NaN, px: 0, py: 0, route: [] };
        level.ports.push(port);
        level.portOf.set(ei * 2 + (out ? 0 : 1), port);
      }
    }
  }

  const local = new Int32Array(n);
  const endpointBelow = (item: number, e: CEdge, out: boolean): boolean => (out ? e.src : e.dst) !== item;

  const build = (level: Level, sized: boolean): { lnodes: LNode[]; ledges: LEdge[]; dummies: Int32Array } => {
    const vertical = level.dir === 'TB' || level.dir === 'BT';
    const start = startSide(level.dir);
    const lnodes: LNode[] = [];
    const ledges: LEdge[] = [];
    level.items.forEach((item, i) => {
      local[item] = i;
      const node = nodes[item];
      const ln = sized ? lnode(vertical ? node.w : node.h, vertical ? node.h : node.w) : lnode(0, 0);
      ln.span = node.isGroup ? Math.min(node.span, ln.w - 2 * node.padX) : node.span;
      ln.key = keyed ? key[item] : NaN;
      lnodes.push(ln);
    });
    const held = (item: number, ei: number, out: boolean): boolean => nodes[item].isGroup && endpointBelow(item, edges[ei], out);
    const offset = (item: number, ei: number, out: boolean): number => {
      if (!sized || !nodes[item].isGroup || !endpointBelow(item, edges[ei], out)) return 0;
      const port = levelOf.get(item)!.portOf.get(ei * 2 + (out ? 0 : 1))!;
      return vertical ? port.px - nodes[item].w / 2 : port.py - nodes[item].h / 2;
    };
    for (const le of level.edges) {
      const e = edges[le.e];
      const edge = ledge(local[le.a], local[le.b], e.minlen);
      if (sized) {
        edge.labelW = vertical ? e.labelW : e.labelH;
        edge.labelH = vertical ? e.labelH : e.labelW;
        edge.tailDx = offset(le.a, le.e, true);
        edge.headDx = offset(le.b, le.e, false);
        edge.tailFixed = held(le.a, le.e, true);
        edge.headFixed = held(le.b, le.e, false);
      }
      ledges.push(edge);
    }
    const dummies = new Int32Array(level.ports.length).fill(-1);
    level.ports.forEach((port, i) => {
      if (port.side === start || port.side === opposite(start)) {
        const d = lnodes.length;
        const ln = lnode(0, 0, port.side === start ? Kind.StartPort : Kind.EndPort);
        ln.key = keyed ? key[port.out ? edges[port.e].dst : edges[port.e].src] : NaN;
        ln.hint = Number.isNaN(port.hint) && keyed && farHint ? farHint(level, port) : port.hint;
        lnodes.push(ln);
        dummies[i] = d;
        const edge = port.out ? ledge(local[port.inner], d) : ledge(d, local[port.inner]);
        if (port.out) {
          edge.tailDx = offset(port.inner, port.e, true);
          edge.tailFixed = held(port.inner, port.e, true);
        } else {
          edge.headDx = offset(port.inner, port.e, false);
          edge.headFixed = held(port.inner, port.e, false);
        }
        ledges.push(edge);
      } else {
        lnodes[local[port.inner]].pin = port.side === Side.Top || port.side === Side.Left ? -1 : 1;
      }
    });
    return { lnodes, ledges, dummies };
  };

  // Where each node sits across the flow in a layout of the whole drawing as one flat graph, in
  // which the nodes of each group stay side by side. The groups are laid out one at a time, each
  // on its own, so this is what gives them an order for their nodes, and for the ports on the far
  // sides of their borders, that agrees with the rest of the drawing. A group's place is the
  // average of its nodes'. Only where every group runs the way the whole drawing does.
  const key = new Float64Array(n).fill(NaN);
  let keyed = false;
  let flatCrossings = 0;
  let farHint: ((level: Level, port: PortEdge) => number) | undefined;
  let flat = order.length > 1 && ports > 1 && edges.length <= MAX_ORDERED_EDGES && ports <= MAX_ORDERED_PORTS;
  for (const level of order) if (level.dir !== rootDir) flat = false;
  if (flat) {
    const vertical = rootDir === 'TB' || rootDir === 'BT';
    const leaf = new Int32Array(n).fill(-1);
    const group = new Int32Array(n).fill(-1);
    const lnodes: LNode[] = [];
    const of: number[] = [];
    const parent: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!nodes[i].isGroup) continue;
      group[i] = parent.length;
      parent.push(-1);
    }
    for (let i = 0; i < n; i++) {
      const p = nodes[i].parent;
      if (nodes[i].isGroup) parent[group[i]] = p >= 0 ? group[p] : -1;
      else {
        leaf[i] = lnodes.length;
        lnodes.push(lnode(vertical ? nodes[i].w : nodes[i].h, vertical ? nodes[i].h : nodes[i].w));
        of.push(p >= 0 ? group[p] : -1);
      }
    }
    const ledges: LEdge[] = [];
    const ledgeOf = new Int32Array(edges.length).fill(-1);
    edges.forEach((e, ei) => {
      if (e.src === e.dst || leaf[e.src] < 0 || leaf[e.dst] < 0) return;
      ledgeOf[ei] = ledges.length;
      ledges.push(ledge(leaf[e.src], leaf[e.dst], e.minlen, vertical ? e.labelW : e.labelH, vertical ? e.labelH : e.labelW));
    });
    flatCrossings = layered(lnodes, ledges, { ...opt, groups: { of: Int32Array.from(of), parent: Int32Array.from(parent) }, orderOnly: true }).crossings ?? 0;
    const sum = new Float64Array(n);
    const count = new Int32Array(n);
    // The last rank each group reaches.
    const last = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) {
      if (leaf[i] < 0) continue;
      key[i] = lnodes[leaf[i]].x;
      for (let p = nodes[i].parent; p >= 0; p = nodes[p].parent) {
        sum[p] += key[i];
        count[p]++;
        last[p] = Math.max(last[p], lnodes[leaf[i]].rank);
      }
    }
    for (let i = 0; i < n; i++) if (count[i] > 0) key[i] = sum[i] / count[i];
    // The ports that edges leave a group by, on its far side, go in the order of where their
    // edges pass the group's last rank in the flat layout, and those that pass it at one place,
    // in the order of where they pass the rank after it. The ports on the near side, and those of
    // edges that come back in, are left to the group to order.
    farHint = (level: Level, port: PortEdge): number => {
      const le = ledgeOf[port.e];
      if (le < 0 || level.id < 0 || !port.out || port.side !== opposite(startSide(level.dir))) return NaN;
      const points = ledges[le].points;
      let inside = key[edges[port.e].src];
      let outside = 0;
      for (let k = 0; k < points.length; k += 2) {
        if (points[k] === last[level.id]) inside = points[k + 1];
        if (points[k] === last[level.id] + 1) outside = points[k + 1];
      }
      return inside + outside * 1e-6;
    };
  }

  let total: CompoundResult = { width: 0, height: 0 };
  const place = (): void => {
    // Top-down: rank each level to learn which side of a group every crossing edge leaves from.
    for (const level of order) {
      for (const port of level.ports) {
        if (nodes[port.inner].isGroup && endpointBelow(port.inner, edges[port.e], port.out)) {
          levelOf.get(port.inner)!.portOf.get(port.e * 2 + (port.out ? 0 : 1))!.side = port.side;
        }
      }
      if (level.edges.length === 0) continue;
      let needed = false;
      for (const le of level.edges) {
        const e = edges[le.e];
        if ((nodes[le.a].isGroup && e.src !== le.a) || (nodes[le.b].isGroup && e.dst !== le.b)) needed = true;
      }
      if (!needed) continue;
      const { lnodes, ledges } = build(level, false);
      orient(lnodes, ledges);
      rank(lnodes, ledges, 1);
      const start = startSide(level.dir);
      level.edges.forEach((le, i) => {
        const e = edges[le.e];
        const aAbove = !ledges[i].reversed;
        if (nodes[le.a].isGroup && e.src !== le.a) {
          levelOf.get(le.a)!.portOf.get(le.e * 2)!.side = aAbove ? opposite(start) : start;
        }
        if (nodes[le.b].isGroup && e.dst !== le.b) {
          levelOf.get(le.b)!.portOf.get(le.e * 2 + 1)!.side = aAbove ? start : opposite(start);
        }
      });
    }

    // Bottom-up: lay out each level now that the sizes of its groups are known.
    for (let q = order.length - 1; q >= 0; q--) {
      const level = order[q];
      const group = level.id >= 0 ? nodes[level.id] : undefined;
      const vertical = level.dir === 'TB' || level.dir === 'BT';
      const flip = level.dir === 'BT' || level.dir === 'RL';
      const { lnodes, ledges, dummies } = build(level, true);
      const size = layered(lnodes, ledges, opt);
      const contentW = vertical ? size.width : size.height;
      const contentH = vertical ? size.height : size.width;
      const padX = group ? group.padX : 0;
      const padTop = group ? group.padTop : 0;
      const boxW = Math.max(contentW + 2 * padX, group ? group.minW : 0);
      const boxH = contentH + padTop + (group ? group.padBottom : 0);
      const offX = (boxW - contentW) / 2;
      const offY = padTop;
      const tx = (lx: number, ly: number): number => offX + (vertical ? lx : flip ? size.height - ly : ly);
      const ty = (lx: number, ly: number): number => offY + (vertical ? (flip ? size.height - ly : ly) : lx);
      const axis = vertical ? 0 : 1;
      const convert = (points: number[]): number[] => {
        const out: number[] = [];
        for (let i = 0; i < points.length; i += 2) out.push(tx(points[i], points[i + 1]), ty(points[i], points[i + 1]), axis);
        return out;
      };

      level.items.forEach((item, i) => {
        nodes[item].x = tx(lnodes[i].x, lnodes[i].y);
        nodes[item].y = ty(lnodes[i].x, lnodes[i].y);
      });
      level.edges.forEach((le, i) => {
        const edge = ledges[i];
        level.routes.set(le.e, convert(edge.points));
        const e = edges[le.e];
        if (e.labelW > 0) {
          e.labelX = tx(edge.labelX, edge.labelY);
          e.labelY = ty(edge.labelX, edge.labelY);
        }
      });
      let k = level.edges.length;
      level.ports.forEach((port, i) => {
        const item = nodes[port.inner];
        if (dummies[i] >= 0) {
          const route = convert(ledges[k++].points);
          const at = port.out ? route.length - 3 : 0;
          let bx = route[at];
          let by = route[at + 1];
          if (port.side === Side.Top) by = 0;
          else if (port.side === Side.Bottom) by = boxH;
          else if (port.side === Side.Left) bx = 0;
          else bx = boxW;
          if (port.out) route.push(bx, by, axis);
          else route.unshift(bx, by, axis);
          port.px = bx;
          port.py = by;
          port.route = route;
          return;
        }
        let ix = item.x;
        let iy = item.y;
        if (item.isGroup && endpointBelow(port.inner, edges[port.e], port.out)) {
          const inner = levelOf.get(port.inner)!.portOf.get(port.e * 2 + (port.out ? 0 : 1))!;
          ix += inner.px - item.w / 2;
          iy += inner.py - item.h / 2;
        } else if (port.side === Side.Top) iy -= item.h / 2;
        else if (port.side === Side.Bottom) iy += item.h / 2;
        else if (port.side === Side.Left) ix -= item.w / 2;
        else ix += item.w / 2;
        let bx = ix;
        let by = iy;
        if (port.side === Side.Top) by = 0;
        else if (port.side === Side.Bottom) by = boxH;
        else if (port.side === Side.Left) bx = 0;
        else bx = boxW;
        const a = port.side === Side.Top || port.side === Side.Bottom ? 0 : 1;
        port.px = bx;
        port.py = by;
        port.route = port.out ? [ix, iy, a, bx, by, a] : [bx, by, a, ix, iy, a];
      });

      if (group) {
        group.w = boxW;
        group.h = boxH;
      } else {
        total = { width: boxW, height: boxH };
      }
    }

    // Top-down again: turn positions inside each box into diagram coordinates.
    for (const level of order) {
      const ox = level.x;
      const oy = level.y;
      for (const item of level.items) {
        const node = nodes[item];
        node.x += ox;
        node.y += oy;
        if (node.isGroup) {
          const child = levelOf.get(item)!;
          child.x = node.x - node.w / 2;
          child.y = node.y - node.h / 2;
        }
      }
    }

    const append = (route: number[], part: number[], ox: number, oy: number): void => {
      for (let i = 0; i < part.length; i += 3) {
        const x = part[i] + ox;
        const y = part[i + 1] + oy;
        const len = route.length;
        if (len >= 3 && Math.abs(route[len - 3] - x) < 0.01 && Math.abs(route[len - 2] - y) < 0.01) continue;
        route.push(x, y, part[i + 2]);
      }
    };

    for (const level of order) {
      for (const le of level.edges) {
        const e = edges[le.e];
        const route: number[] = [];
        const outward: Level[] = [];
        for (let item = e.src; nodes[item].parent !== level.id; item = nodes[item].parent) {
          outward.push(levelOf.get(nodes[item].parent)!);
        }
        for (const lv of outward) append(route, lv.portOf.get(le.e * 2)!.route, lv.x, lv.y);
        append(route, level.routes.get(le.e)!, level.x, level.y);
        const inward: Level[] = [];
        for (let item = e.dst; nodes[item].parent !== level.id; item = nodes[item].parent) {
          inward.push(levelOf.get(nodes[item].parent)!);
        }
        for (let i = inward.length - 1; i >= 0; i--) {
          append(route, inward[i].portOf.get(le.e * 2 + 1)!.route, inward[i].x, inward[i].y);
        }
        e.route = route;
        if (e.labelW > 0) {
          e.labelX += level.x;
          e.labelY += level.y;
        }
      }
    }
  };
  // The groups are laid out in the order of the flat layout. Where that crosses much more than
  // the flat layout did, they are laid out again in their own order too, and whichever crosses
  // less is kept: the flat layout does not see the groups as the boxes they are drawn as, and
  // now and then its order does not suit them.
  keyed = flat;
  place();
  let crossings = -1;
  if (flat) {
    crossings = routeCrossings(nodes, edges);
    if (crossings > flatCrossings * FLAT_SLACK + FLAT_SPARE) {
      const first = snapshot(nodes, edges, order, total);
      keyed = false;
      place();
      const own = routeCrossings(nodes, edges);
      if (own >= crossings) {
        keyed = true;
        total = restore(first, nodes, edges, order);
      } else crossings = own;
    }
  }

  // The groups were laid out from the inside out, so the ports on a group's border are in an order
  // that only guesses where their edges go once they leave it. Where more than one edge passes the
  // far side of a group, the drawing is laid out again with those ports in the order of where
  // their edges went the first time, and kept if that crosses less.
  if (ports > 1 && ports <= MAX_ORDERED_PORTS && edges.length <= MAX_ORDERED_EDGES) {
    let again = false;
    for (const level of order) {
      if (level.id < 0) continue;
      const box = nodes[level.id];
      const vertical = level.dir === 'TB' || level.dir === 'BT';
      const end = opposite(startSide(level.dir));
      let count = 0;
      for (const port of level.ports) {
        if (port.side !== end) continue;
        // The port's place in the route, and the first point after it, outside the group, that
        // is not in line with it: where the edge turns to, past a straight run out of the port.
        const route = edges[port.e].route;
        const bx = level.x + port.px;
        const by = level.y + port.py;
        let at = -1;
        for (let k = 0; k < route.length && (at < 0 || port.out); k += 3) if (Math.abs(route[k] - bx) < 0.01 && Math.abs(route[k + 1] - by) < 0.01) at = k;
        if (at < 0) continue;
        const a = vertical ? 0 : 1;
        let next = port.out ? at + 3 : at - 3;
        while (next >= 0 && next < route.length && Math.abs(route[next + a] - route[at + a]) < IN_LINE) next += port.out ? 3 : -3;
        if (next < 0 || next >= route.length) continue;
        port.hint = route[next + a] - (vertical ? box.x - box.w / 2 : box.y - box.h / 2);
        count++;
      }
      if (count > 1) again = true;
    }
    if (again) {
      const before = crossings >= 0 ? crossings : routeCrossings(nodes, edges);
      const first = before > 0 ? snapshot(nodes, edges, order, total) : undefined;
      if (first) {
        place();
        if (routeCrossings(nodes, edges) >= before) total = restore(first, nodes, edges, order);
      }
    }
  }

  for (const ei of stray) {
    const e = edges[ei];
    const a = nodes[e.src];
    const b = nodes[e.dst];
    e.route = [a.x, a.y, 0, b.x, b.y, 0];
    e.labelX = (a.x + b.x) / 2;
    e.labelY = (a.y + b.y) / 2;
  }
  for (const ei of loops) {
    const e = edges[ei];
    const node = nodes[e.src];
    e.labelX = node.x + node.w / 2 + 28 + e.labelW / 2;
    e.labelY = node.y;
  }

  return total;
}
