import { describe, expect, it } from 'vitest';
import { cnode, compoundLayout, type CEdge, type CNode, type Dir } from '../../src/layout/compound.js';
import { random } from '../support/corpus.js';

const OPTIONS = { nodeSep: 40, edgeSep: 16, rankSep: 48, portSep: 20 };
const DIRS: Dir[] = ['TB', 'BT', 'LR', 'RL'];

function edge(src: number, dst: number, labelW = 0, labelH = 0): CEdge {
  return { src, dst, minlen: 1, labelW, labelH, route: [], labelX: 0, labelY: 0 };
}

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
    groups.push(nodes.length);
    nodes.push(node);
  }
  const leaves = 3 + int(30);
  for (let i = 0; i < leaves; i++) {
    const parent = groups.length > 0 && rnd() < 0.5 ? groups[int(groups.length)] : -1;
    const node = cnode(30 + int(120), 30 + int(50), parent);
    node.seq = i;
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
