import { Kind, layered, ledge, lnode, orient, rank, type LEdge, type LNode, type LayeredOptions } from './layered.js';

export type Dir = 'TB' | 'BT' | 'LR' | 'RL';

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

export function cnode(w: number, h: number, parent = -1): CNode {
  return { w, h, parent, isGroup: false, dir: undefined, padX: 0, padTop: 0, padBottom: 0, minW: 0, seq: 0, x: 0, y: 0 };
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
        const port: PortEdge = { e: ei, inner, out, side: Side.Top, px: 0, py: 0, route: [] };
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
      lnodes.push(sized ? lnode(vertical ? node.w : node.h, vertical ? node.h : node.w) : lnode(0, 0));
    });
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
      }
      ledges.push(edge);
    }
    const dummies = new Int32Array(level.ports.length).fill(-1);
    level.ports.forEach((port, i) => {
      if (port.side === start || port.side === opposite(start)) {
        const d = lnodes.length;
        lnodes.push(lnode(0, 0, port.side === start ? Kind.StartPort : Kind.EndPort));
        dummies[i] = d;
        const edge = port.out ? ledge(local[port.inner], d) : ledge(d, local[port.inner]);
        if (port.out) edge.tailDx = offset(port.inner, port.e, true);
        else edge.headDx = offset(port.inner, port.e, false);
        ledges.push(edge);
      } else {
        lnodes[local[port.inner]].pin = port.side === Side.Top || port.side === Side.Left ? -1 : 1;
      }
    });
    return { lnodes, ledges, dummies };
  };

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
  let total: CompoundResult = { width: 0, height: 0 };
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
