import { describe, expect, it } from 'vitest';
import { cnode, compoundLayout, type CEdge, type CNode, type Dir } from '../../src/layout/compound.js';
import { random } from '../support/corpus.js';

const OPTIONS = { nodeSep: 40, edgeSep: 16, rankSep: 48, portSep: 20 };
const DIRS: Dir[] = ['TB', 'BT', 'LR', 'RL'];

function edge(src: number, dst: number, labelW = 0, labelH = 0): CEdge {
  return { src, dst, minlen: 1, labelW, labelH, route: [], labelX: 0, labelY: 0 };
}

// Every other graph lets edges spread along the sides of its nodes.
function randomGraph(seed: number): { nodes: CNode[]; edges: CEdge[]; dir: Dir } {
  const rnd = random(seed);
  const int = (n: number): number => Math.floor(rnd() * n);
  const nodes: CNode[] = [];
  const groups: number[] = [];
  const groupCount = int(5);
  for (let g = 0; g < groupCount; g++) {
    const node = cnode(0, 0, groups.length > 0 && rnd() < 0.4 ? groups[int(groups.length)] : -1);
    node.isGroup = true;
    node.padX = 20;
    node.padTop = 40;
    node.padBottom = 20;
    node.minW = 60;
    node.dir = rnd() < 0.3 ? DIRS[int(4)] : undefined;
    node.seq = 1000 + g;
    if (seed % 2 === 0) node.span = Infinity;
    groups.push(nodes.length);
    nodes.push(node);
  }
  const leaves = 3 + int(30);
  for (let i = 0; i < leaves; i++) {
    const parent = groups.length > 0 && rnd() < 0.5 ? groups[int(groups.length)] : -1;
    const node = cnode(30 + int(120), 30 + int(50), parent);
    node.seq = i;
    if (seed % 2 === 0) node.span = Math.min(node.w, node.h) - 24;
    nodes.push(node);
  }
  const edges: CEdge[] = [];
  const count = int(leaves * 2);
  for (let i = 0; i < count; i++) {
    const labelled = rnd() < 0.3;
    edges.push(edge(int(nodes.length), int(nodes.length), labelled ? 20 + int(60) : 0, labelled ? 24 : 0));
  }
  return { nodes, edges, dir: DIRS[int(4)] };
}

function isAncestor(nodes: CNode[], a: number, b: number): boolean {
  for (let p = nodes[b].parent; p >= 0; p = nodes[p].parent) if (p === a) return true;
  return false;
}

function onBorder(node: CNode, x: number, y: number): boolean {
  const dx = Math.abs(x - node.x);
  const dy = Math.abs(y - node.y);
  const inside = dx <= node.w / 2 + 0.5 && dy <= node.h / 2 + 0.5;
  const edgeX = Math.abs(dx - node.w / 2) <= 0.5;
  const edgeY = Math.abs(dy - node.h / 2) <= 0.5;
  return inside && (edgeX || edgeY);
}

describe('compound layout', () => {
  it('keeps random graphs well formed', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { nodes, edges, dir } = randomGraph(seed);
      const size = compoundLayout(nodes, edges, dir, OPTIONS);
      const where = `seed ${seed}`;

      expect(Number.isFinite(size.width) && Number.isFinite(size.height), where).toBe(true);
      nodes.forEach((node, i) => {
        expect(Number.isFinite(node.x) && Number.isFinite(node.y), `${where} node ${i}`).toBe(true);
        expect(node.x - node.w / 2, `${where} node ${i} left`).toBeGreaterThanOrEqual(-0.5);
        expect(node.y - node.h / 2, `${where} node ${i} top`).toBeGreaterThanOrEqual(-0.5);
        expect(node.x + node.w / 2, `${where} node ${i} right`).toBeLessThanOrEqual(size.width + 0.5);
        expect(node.y + node.h / 2, `${where} node ${i} bottom`).toBeLessThanOrEqual(size.height + 0.5);
        if (node.parent >= 0) {
          const parent = nodes[node.parent];
          expect(Math.abs(node.x - parent.x) + node.w / 2, `${where} node ${i} in parent`).toBeLessThanOrEqual(parent.w / 2 + 0.5);
          expect(Math.abs(node.y - parent.y) + node.h / 2, `${where} node ${i} in parent`).toBeLessThanOrEqual(parent.h / 2 + 0.5);
        }
      });

      for (let a = 0; a < nodes.length; a++) {
        for (let b = a + 1; b < nodes.length; b++) {
          if (nodes[a].parent !== nodes[b].parent) continue;
          const overlapX = (nodes[a].w + nodes[b].w) / 2 - Math.abs(nodes[a].x - nodes[b].x);
          const overlapY = (nodes[a].h + nodes[b].h) / 2 - Math.abs(nodes[a].y - nodes[b].y);
          expect(overlapX > 0.5 && overlapY > 0.5, `${where} nodes ${a} and ${b} overlap`).toBe(false);
        }
      }

      edges.forEach((e, i) => {
        if (e.src === e.dst) return;
        expect(e.route.length % 3, `${where} edge ${i}`).toBe(0);
        expect(e.route.length, `${where} edge ${i} has a route`).toBeGreaterThanOrEqual(6);
        for (const value of e.route) expect(Number.isFinite(value), `${where} edge ${i}`).toBe(true);
        if (isAncestor(nodes, e.src, e.dst) || isAncestor(nodes, e.dst, e.src)) return;
        const last = e.route.length - 3;
        expect(onBorder(nodes[e.src], e.route[0], e.route[1]), `${where} edge ${i} starts on its source`).toBe(true);
        expect(onBorder(nodes[e.dst], e.route[last], e.route[last + 1]), `${where} edge ${i} ends on its target`).toBe(true);
      });
    }
  });

  it('is deterministic', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const first = randomGraph(seed);
      const second = randomGraph(seed);
      compoundLayout(first.nodes, first.edges, first.dir, OPTIONS);
      compoundLayout(second.nodes, second.edges, second.dir, OPTIONS);
      expect(second.nodes.map((n) => [n.x, n.y, n.w, n.h])).toEqual(first.nodes.map((n) => [n.x, n.y, n.w, n.h]));
      expect(second.edges.map((e) => e.route)).toEqual(first.edges.map((e) => e.route));
    }
  });

  it('runs ranks along the requested direction', () => {
    for (const dir of DIRS) {
      const nodes = [cnode(60, 40), cnode(60, 40), cnode(60, 40)];
      nodes.forEach((node, i) => (node.seq = i));
      compoundLayout(nodes, [edge(0, 1), edge(1, 2)], dir, OPTIONS);
      const axis = dir === 'TB' || dir === 'BT' ? 'y' : 'x';
      const sign = dir === 'TB' || dir === 'LR' ? 1 : -1;
      expect(sign * (nodes[1][axis] - nodes[0][axis])).toBeGreaterThan(40);
      expect(sign * (nodes[2][axis] - nodes[1][axis])).toBeGreaterThan(40);
    }
  });

  it('keeps a long edge straight through the ranks it skips', () => {
    const nodes = [cnode(60, 40), cnode(60, 40), cnode(60, 40)];
    nodes.forEach((node, i) => (node.seq = i));
    const edges = [edge(0, 1), edge(1, 2), edge(0, 2)];
    compoundLayout(nodes, edges, 'TB', OPTIONS);
    const route = edges[2].route;
    const xs = new Set<number>();
    for (let i = 3; i < route.length - 3; i += 3) xs.add(Math.round(route[i]));
    expect(xs.size).toBe(1);
  });

  it('keeps the edges on one side of a node at its middle unless the node has a span', () => {
    const nodes = [cnode(120, 40), cnode(60, 40), cnode(60, 40), cnode(60, 40)];
    nodes.forEach((node, i) => (node.seq = i));
    const edges = [edge(0, 1), edge(0, 2), edge(0, 3)];
    compoundLayout(nodes, edges, 'TB', OPTIONS);
    for (const e of edges) expect(e.route[0]).toBeCloseTo(nodes[0].x, 5);
  });

  it('spreads the edges on one side of a node in the order of the nodes they lead to', () => {
    for (const dir of DIRS) {
      const nodes = [cnode(120, 120), cnode(60, 60), cnode(60, 60), cnode(60, 60)];
      nodes.forEach((node, i) => (node.seq = i));
      nodes[0].span = 96;
      const edges = [edge(0, 1), edge(0, 2), edge(0, 3)];
      compoundLayout(nodes, edges, dir, OPTIONS);
      const across = dir === 'TB' || dir === 'BT' ? 0 : 1;
      const starts = edges.map((e) => e.route[across] - (across === 0 ? nodes[0].x : nodes[0].y));
      const targets = edges.map((e) => (across === 0 ? nodes[e.dst].x : nodes[e.dst].y));
      const byStart = [0, 1, 2].sort((a, b) => starts[a] - starts[b]);
      const byTarget = [0, 1, 2].sort((a, b) => targets[a] - targets[b]);
      expect(byStart, dir).toEqual(byTarget);
      // None of the three can run straight, so they stay around the middle, a pitch apart.
      expect(starts[byStart[0]], dir).toBeCloseTo(-16, 5);
      expect(starts[byStart[1]], dir).toBeCloseTo(0, 5);
      expect(starts[byStart[2]], dir).toBeCloseTo(16, 5);
      for (const e of edges) expect(onBorder(nodes[0], e.route[0], e.route[1]), dir).toBe(true);
    }
  });

  it('keeps an edge that arrives apart from one that leaves on the same side', () => {
    const nodes = [cnode(60, 40), cnode(60, 40)];
    nodes.forEach((node, i) => {
      node.seq = i;
      node.span = 36;
    });
    const edges = [edge(0, 1), edge(1, 0)];
    compoundLayout(nodes, edges, 'TB', OPTIONS);
    const [down, up] = edges.map((e) => e.route);
    expect(Math.abs(down[down.length - 3] - up[0])).toBeCloseTo(16, 5);
    expect(Math.abs(down[0] - up[up.length - 3])).toBeCloseTo(16, 5);
  });

  it('shares a place among edges that run the same way when there is no room for one each', () => {
    const nodes: CNode[] = [];
    for (let i = 0; i <= 12; i++) nodes.push(cnode(60, 40));
    nodes.forEach((node, i) => {
      node.seq = i;
      node.span = 36;
    });
    const edges: CEdge[] = [];
    for (let i = 0; i < 12; i++) edges.push(edge(i, 12));
    // One edge the other way on the same side, which keeps a place of its own.
    edges.push(edge(12, 0));
    compoundLayout(nodes, edges, 'TB', OPTIONS);
    const into = edges.slice(0, 12).map((e) => e.route[e.route.length - 3]);
    expect(new Set(into.map((x) => Math.round(x * 100))).size).toBeLessThanOrEqual(2);
    const back = edges[12].route;
    expect(back[1]).toBeCloseTo(nodes[12].y - 20, 5);
    for (const x of into) expect(Math.abs(x - back[0])).toBeGreaterThanOrEqual(8);
  });

  it('stands a rank that only sends edges on one line, and hangs a rank that only receives them from one', () => {
    const lay = (span: number): CNode[] => {
      const nodes = [cnode(60, 40), cnode(60, 120), cnode(60, 30), cnode(60, 90)];
      nodes.forEach((node, i) => {
        node.seq = i;
        node.span = span;
      });
      compoundLayout(nodes, [edge(0, 2), edge(1, 2), edge(0, 3), edge(1, 3)], 'TB', OPTIONS);
      return nodes;
    };
    const spread = lay(36);
    expect(spread[0].y + 20).toBeCloseTo(spread[1].y + 60, 5);
    expect(spread[2].y - 15).toBeCloseTo(spread[3].y - 45, 5);
    // Without spreading, as in the diagram types that do not use it yet, each rank is centered.
    const plain = lay(0);
    expect(plain[0].y).toBeCloseTo(plain[1].y, 5);
    expect(plain[2].y).toBeCloseTo(plain[3].y, 5);
  });

  it('gives the gap between two ranks more room when edges run far across it', () => {
    const gapUnder = (children: number): number => {
      const nodes = [cnode(100, 40)];
      const edges: CEdge[] = [];
      for (let i = 1; i <= children; i++) {
        nodes.push(cnode(100, 40));
        edges.push(edge(0, i));
      }
      nodes.forEach((node, i) => (node.seq = i));
      compoundLayout(nodes, edges, 'TB', OPTIONS);
      return nodes[1].y - nodes[0].y - 40;
    };
    expect(gapUnder(3)).toBeCloseTo(OPTIONS.rankSep, 5);
    // Seven children reach 420 across from the middle; an eighth of that is more than the usual gap.
    expect(gapUnder(7)).toBeCloseTo(420 / 8, 5);
    expect(gapUnder(40)).toBeCloseTo(3 * OPTIONS.rankSep, 5);
  });

  it('moves an end along its side to let its edge run straight, and no closer to its neighbour than a pitch', () => {
    // A wide node above four narrow ones.
    const nodes = [cnode(400, 40), cnode(40, 40), cnode(40, 40), cnode(40, 40), cnode(40, 40)];
    nodes.forEach((node, i) => {
      node.seq = i;
      node.span = node.w - 24;
    });
    const edges = [edge(0, 1), edge(0, 2), edge(0, 3), edge(0, 4)];
    compoundLayout(nodes, edges, 'TB', OPTIONS);
    // Each child is under the wide node, so each edge runs straight down to it.
    for (const e of edges) expect(e.route[0]).toBeCloseTo(e.route[e.route.length - 3], 5);
    const twoWay = [cnode(200, 40), cnode(40, 40)];
    twoWay.forEach((node, i) => {
      node.seq = i;
      node.span = node.w - 24;
    });
    const pair = [edge(0, 1), edge(1, 0)];
    compoundLayout(twoWay, pair, 'TB', OPTIONS);
    expect(Math.abs(pair[0].route[0] - pair[1].route[pair[1].route.length - 3])).toBeCloseTo(16, 5);
  });

  it('moves the edges that leave side by side closer together before it lets them share a place', () => {
    const nodes = [cnode(60, 40)];
    const edges: CEdge[] = [];
    for (let i = 1; i <= 7; i++) {
      nodes.push(cnode(60, 40));
      edges.push(edge(0, i));
    }
    nodes.forEach((node, i) => (node.seq = i));
    nodes[0].span = 36;
    compoundLayout(nodes, edges, 'TB', OPTIONS);
    const starts = edges.map((e) => e.route[0]).sort((a, b) => a - b);
    // Six gaps of half a pitch each across the 36 there is.
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeCloseTo(6, 5);
  });

  it('draws an edge as one curve across a rank that only a twin of another edge put there', () => {
    const lay = (twin: boolean): CEdge[] => {
      const nodes = [cnode(60, 40), cnode(60, 40), cnode(60, 40), cnode(60, 40)];
      nodes.forEach((node, i) => {
        node.seq = i;
        node.span = 36;
      });
      const edges = [edge(0, 1), edge(0, 2), edge(0, 3)];
      if (twin) edges.push(edge(0, 3));
      compoundLayout(nodes, edges, 'TB', OPTIONS);
      return edges;
    };
    const plain = lay(false);
    const twinned = lay(true);
    // The twins make every edge take a rank in the middle, but none of them needs a bend there.
    for (const e of twinned.slice(0, 2)) expect(e.route).toHaveLength(6);
    expect(twinned[0].route[1]).toBeCloseTo(plain[0].route[1], 5);
    // The gap is one level taller, for the twins to turn at two.
    expect(twinned[0].route[4]).toBeCloseTo(plain[0].route[4] + 16, 5);
    // The twins leave and arrive at places of their own.
    const [one, other] = [twinned[2].route, twinned[3].route];
    expect(Math.abs(one[0] - other[0])).toBeGreaterThanOrEqual(8);
    expect(Math.abs(one[one.length - 3] - other[other.length - 3])).toBeGreaterThanOrEqual(8);
    // They would run close beside each other, so one turns straight away and the other further down.
    const turnsAt = (route: number[]): number => (Math.abs(route[3] - route[0]) < 0.01 ? route[4] : route[1]);
    expect(Math.abs(turnsAt(one) - turnsAt(other))).toBeGreaterThanOrEqual(10);
  });

  it('keeps twin edges apart where their ends cannot be', () => {
    const nodes = [cnode(60, 40), cnode(60, 40)];
    nodes.forEach((node, i) => (node.seq = i));
    const edges = [edge(0, 1), edge(0, 1)];
    compoundLayout(nodes, edges, 'TB', OPTIONS);
    const [a, b] = edges.map((e) => e.route);
    expect(a).toHaveLength(9);
    expect(b).toHaveLength(9);
    expect(a[0]).toBeCloseTo(b[0], 5);
    expect(Math.abs(a[3] - b[3])).toBeCloseTo(OPTIONS.edgeSep, 5);
  });

  it('survives groups that contain each other', () => {
    const a = cnode(0, 0, 1);
    const b = cnode(0, 0, 0);
    a.isGroup = b.isGroup = true;
    const leaf = cnode(40, 40, 0);
    const nodes = [a, b, leaf, cnode(40, 40)];
    const edges = [edge(2, 3)];
    const size = compoundLayout(nodes, edges, 'TB', OPTIONS);
    expect(Number.isFinite(size.width)).toBe(true);
    expect(edges[0].route.length).toBeGreaterThanOrEqual(6);
  });
});
