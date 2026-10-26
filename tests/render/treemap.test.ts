import { describe, expect, it } from 'vitest';
import { formatter } from '../../src/diagrams/treemap/format.js';
import { layoutTreemap, type Box } from '../../src/diagrams/treemap/layout.js';
import type { TreemapNode } from '../../src/diagrams/treemap/model.js';
import { parse, render, supports } from '../../src/index.js';
import { Style, metricsMeasurer } from '../../src/text/measurer.js';
import { elements } from '../support/xml.js';

const options = { measurer: metricsMeasurer };

const BASIC = 'treemap-beta\n"Category A"\n    "Item A1": 10\n    "Item A2": 20\n"Category B"\n    "Item B1": 15\n    "Item B2": 25\n';

function config(treemap: string, body: string): string {
  return `---\nconfig:\n  treemap:\n${treemap}\n---\n${body}`;
}

interface Rect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  attrs: Map<string, string>;
}

function rects(svg: string): Rect[] {
  const out: Rect[] = [];
  let id = '';
  for (const el of elements(svg)) {
    if (el.name === 'g' && el.attrs.has('data-id')) id = el.attrs.get('data-id')!;
    if (el.name !== 'rect') continue;
    const n = (key: string): number => Number(el.attrs.get(key));
    out.push({ id, x: n('x'), y: n('y'), w: n('width'), h: n('height'), attrs: el.attrs });
  }
  return out;
}

const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const leaf = (name: string, value: number): TreemapNode => ({ name, value });
const insets = { gap: 4, header: 28, side: 6 };

describe('treemap layout', () => {
  it('gives each box an area in proportion to its value', () => {
    const nodes = [40, 30, 20, 8, 2].map((value, i) => leaf(`n${i}`, value));
    const boxes = layoutTreemap(nodes, 1000, 600, { gap: 0, header: 28, side: 6 });
    expect(boxes.length).toBe(5);
    for (const b of boxes) expect((b.w * b.h) / 600000).toBeCloseTo(b.value / 100, 2);
    for (const a of boxes) for (const b of boxes) if (a !== b) expect(overlap(a, b)).toBe(false);
  });

  it('keeps boxes close to square', () => {
    const nodes = Array.from({ length: 40 }, (_, i) => leaf(`n${i}`, 1 + (i % 7)));
    const boxes = layoutTreemap(nodes, 800, 500, { gap: 0, header: 28, side: 6 });
    const ratios = boxes.map((b) => Math.max(b.w / b.h, b.h / b.w));
    expect(ratios.reduce((sum, r) => sum + r, 0) / ratios.length).toBeLessThan(1.6);
    expect(Math.max(...ratios)).toBeLessThan(4);
  });

  it('fills the frame and leaves the gap between siblings', () => {
    const boxes = layoutTreemap([leaf('a', 1), leaf('b', 1)], 400, 200, { gap: 10, header: 28, side: 6 });
    boxes.sort((a, b) => a.x - b.x);
    expect([boxes[0].x, boxes[0].y, boxes[0].h]).toEqual([0, 0, 200]);
    expect(boxes[1].x + boxes[1].w).toBe(400);
    expect(boxes[1].x - (boxes[0].x + boxes[0].w)).toBe(10);
  });

  it('nests children inside their section, under its header', () => {
    const tree: TreemapNode[] = [
      { name: 's', children: [leaf('a', 3), { name: 't', children: [leaf('b', 1), leaf('c', 1)] }] },
      leaf('d', 2),
    ];
    const boxes = layoutTreemap(tree, 600, 400, insets);
    expect(boxes.map((b) => b.node.name).sort()).toEqual(['a', 'b', 'c', 'd', 's', 't']);
    const byName = new Map(boxes.map((b) => [b.node.name, b]));
    expect(byName.get('s')!.value).toBe(5);
    expect(byName.get('t')!.value).toBe(2);
    for (const b of boxes) {
      const parent = b.parent;
      if (!parent) continue;
      expect(b.x).toBeGreaterThanOrEqual(parent.x + insets.side);
      expect(b.y).toBeGreaterThanOrEqual(parent.y + insets.header);
      expect(b.x + b.w).toBeLessThanOrEqual(parent.x + parent.w - insets.side);
      expect(b.y + b.h).toBeLessThanOrEqual(parent.y + parent.h - insets.side);
    }
    // Every box takes the color of the top-level node above it.
    expect(boxes.map((b) => b.series).sort()).toEqual([0, 0, 0, 0, 0, 1]);
  });

  it('gives a section too small for its header its whole box', () => {
    const tree: TreemapNode[] = [{ name: 's', children: [leaf('a', 2), { name: 't', children: [leaf('b', 1), leaf('c', 1)] }] }];
    const boxes = layoutTreemap(tree, 300, 30, insets);
    expect(boxes.map((b) => b.node.name).sort()).toEqual(['a', 'b', 'c', 's', 't']);
    const s = boxes.find((b) => b.node.name === 's')!;
    expect(s.headed).toBe(false);
    for (const b of boxes) {
      if (b === s) continue;
      expect(b.w * b.h).toBeGreaterThan(0);
      expect(b.x).toBeGreaterThanOrEqual(s.x);
      expect(b.y).toBeGreaterThanOrEqual(s.y);
      expect(b.x + b.w).toBeLessThanOrEqual(s.x + s.w);
      expect(b.y + b.h).toBeLessThanOrEqual(s.y + s.h);
    }
    expect(layoutTreemap(tree, 300, 300, insets).find((b) => b.node.name === 's')!.headed).toBe(true);
  });

  it('keeps a box thinner than the gap, and one with no room at all', () => {
    const thin = layoutTreemap([leaf('big', 397), leaf('thin', 3)], 400, 100, insets);
    expect(thin.map((b) => b.node.name)).toEqual(['big', 'thin']);
    expect(thin[1].w).toBeGreaterThan(0);
    expect(overlap(thin[0], thin[1])).toBe(false);

    const speck = layoutTreemap([leaf('big', 1e6), { name: 's', children: [leaf('speck', 1)] }], 100, 100, insets);
    expect(speck.map((b) => b.node.name)).toEqual(['big', 's', 'speck']);
    for (const b of speck.slice(1)) expect(b.w * b.h).toBe(0);
  });

  it('leaves out what has no positive value', () => {
    const tree: TreemapNode[] = [leaf('a', 1), leaf('zero', 0), leaf('negative', -5), leaf('nan', NaN), { name: 'empty', children: [] }];
    expect(layoutTreemap(tree, 100, 100, insets).map((b) => b.node.name)).toEqual(['a']);
    expect(layoutTreemap([], 100, 100, insets)).toEqual([]);
    expect(layoutTreemap([leaf('huge', 1e308), leaf('also', 1e308)], 100, 100, insets)).toEqual([]);
  });
});

describe('treemap value formats', () => {
  it('formats the specifiers Mermaid documents', () => {
    expect(formatter(',')(1234567.5)).toBe('1,234,567.5');
    expect(formatter(',')(0.35)).toBe('0.35');
    expect(formatter('$')(1234)).toBe('$1234');
    expect(formatter('.1f')(12)).toBe('12.0');
    expect(formatter('.1%')(0.357)).toBe('35.7%');
    expect(formatter('$0,0')(700000)).toBe('$700,000');
    expect(formatter('$.2f')(5)).toBe('$5.00');
    expect(formatter('$,.2f')(1234.5)).toBe('$1,234.50');
    expect(formatter('$.1%')(0.25)).toBe('$25.0%');
    expect(formatter('d')(12.6)).toBe('13');
    expect(formatter('+,')(1000)).toBe('+1,000');
    expect(formatter('.3~f')(1.5)).toBe('1.5');
  });

  it('falls back to thousands separators for what it does not know', () => {
    expect(formatter('not a format')(1234)).toBe('1,234');
    expect(formatter('')(1234)).toBe('1234');
    expect(formatter('.999f')(1)).toBe('1.' + '0'.repeat(20));
  });
});

describe('treemap rendering', () => {
  it('draws sections with a header and leaves with a name and a value', () => {
    const { svg, type, width, height } = render(BASIC, options);
    expect(type).toBe('treemap');
    expect(supports('treemap\n"a": 1')).toBe(true);
    expect([width, height]).toEqual([656, 416]);
    expect(svg.match(/class="pele-node pele-section"/g)?.length).toBe(2);
    expect(svg.match(/class="pele-node pele-leaf"/g)?.length).toBe(4);
    expect(svg).toContain('font-weight="var(--_hw)">Category A<');
    expect(svg).toContain('>Item B2<');
    expect(svg).toContain('>25<');
    // The value of a section is the sum of its leaves.
    expect(svg).toMatch(/class="pele-value"[^>]*>40</);
  });

  it('colors each top-level section and what is inside it with one series color', () => {
    const all = rects(render(BASIC, options).svg);
    const fill = (id: string): string => all.find((r) => r.id === id)!.attrs.get('fill')!;
    expect(fill('Category A')).toContain('--pele-series-1');
    expect(fill('Item A1')).toBe(fill('Category A'));
    expect(fill('Category B')).toContain('--pele-series-2');
    expect(fill('Item B2')).toBe(fill('Category B'));
    expect(all.find((r) => r.id === 'Category A')!.attrs.get('fill-opacity')).toBe('0.12');
    expect(all.find((r) => r.id === 'Item A1')!.attrs.has('fill-opacity')).toBe(false);
  });

  it('sizes leaves by value and keeps them inside their section', () => {
    const all = rects(render(BASIC, options).svg);
    const get = (id: string): Rect => all.find((r) => r.id === id)!;
    expect(get('Item B2').w * get('Item B2').h).toBeGreaterThan(get('Item B1').w * get('Item B1').h);
    expect(get('Category B').w * get('Category B').h).toBeGreaterThan(get('Category A').w * get('Category A').h);
    const section = get('Category A');
    for (const id of ['Item A1', 'Item A2']) {
      const r = get(id);
      expect(r.x).toBeGreaterThan(section.x);
      expect(r.y).toBeGreaterThanOrEqual(section.y + 28);
      expect(r.x + r.w).toBeLessThan(section.x + section.w);
      expect(r.y + r.h).toBeLessThan(section.y + section.h);
    }
  });

  it('builds the hierarchy from indentation', () => {
    const model = parse('treemap\n"A"\n  "B"\n    "c": 1\n  "d": 2\n"E"\n      "f": 3\n "g": 4');
    expect(model.type).toBe('treemap');
    if (model.type === 'treemap') {
      const shape = (nodes: TreemapNode[]): unknown => nodes.map((n) => (n.children ? [n.name, shape(n.children)] : n.name));
      expect(shape(model.roots)).toEqual([['A', [['B', ['c']], 'd']], ['E', ['f', 'g']]]);
    }
  });

  it('applies classDef styles to boxes and their text', () => {
    const { svg } = render(
      'treemap\n"S":::frame\n  "a": 1:::hot\n  "b": 2\nclassDef hot fill:red,color:blue,stroke:#FFD600;\nclassDef frame fill:#eee,stroke-width:2px',
      options
    );
    expect(svg).toContain('class="pele-node pele-leaf hot" data-id="a"');
    expect(svg).toMatch(/data-id="a"><rect[^>]* style="rx:var\(--_r\);fill:red;stroke:#FFD600;"\/><text[^>]* style="fill:blue;">a</);
    const frame = rects(svg).find((r) => r.id === 'S')!;
    expect(frame.attrs.get('style')).toBe('rx:var(--_r);fill:#eee;stroke-width:2px;');
    expect(frame.attrs.has('fill-opacity')).toBe(false);
    expect(svg).toContain('class="pele-node pele-section frame"');
  });

  it('reads class names that start with title', () => {
    const { svg } = render('treemap\n"S":::titles\n  "a": 1:::title_2\nclassDef title_2 fill:red', options);
    expect(svg).toContain('class="pele-node pele-section titles"');
    expect(svg).toContain('class="pele-node pele-leaf title_2" data-id="a"');
  });

  it('honours showValues, padding, nodeWidth, nodeHeight, diagramPadding and valueFormat', () => {
    const base = render(BASIC, options);
    const bare = render(config('    showValues: false', BASIC), options).svg;
    expect(bare).not.toContain('pele-value');
    expect(bare).toContain('>Item A1<');

    const sized = render(config('    nodeWidth: 30\n    nodeHeight: 20', BASIC), options);
    expect([sized.width, sized.height]).toEqual([316, 216]);
    const padded = render(config('    diagramPadding: 50', BASIC), options);
    expect(padded.width - base.width).toBe(84);
    expect(render(config('    diagramPadding: 50', BASIC), { ...options, padding: 0 }).width).toBe(640);

    const gap = (svg: string): number => {
      const all = rects(svg);
      const a = all.find((r) => r.id === 'Category B')!;
      const b = all.find((r) => r.id === 'Category A')!;
      return b.x - (a.x + a.w);
    };
    expect(gap(base.svg)).toBe(4);
    expect(gap(render(config('    padding: 20', BASIC), options).svg)).toBe(20);

    const money = render(config("    valueFormat: '$0,0'", 'treemap\n"Budget"\n  "Salaries": 700000\n  "Equipment": 200000'), options).svg;
    expect(money).toContain('>$700,000<');
    expect(money).toContain('>$900,000<');
  });

  it('shrinks, shortens, or hides text that does not fit', () => {
    const { svg } = render(
      'treemap\n"A section with a very long name indeed"\n  "big": 1000\n  "A leaf with quite a long name": 60\n  "tiny": 12\n"other": 3000',
      options
    );
    expect(svg).toMatch(/font-weight="var\(--_hw\)">A sect[^<]*…</);
    expect(svg).toMatch(/font-size="(9|1[0-5])">A leaf with[^<]*</);
    expect(svg).not.toMatch(/<text[^>]*>tiny</);
    expect(rects(svg).some((r) => r.id === 'tiny')).toBe(true);
    expect(svg).toContain('<title>tiny</title>');
    expect(svg).toContain('<title>A section with a very long name indeed</title>');
    expect(svg).not.toContain('<title>other</title>');
  });

  it('draws every node of a large, deep tree', () => {
    let src = 'treemap\n';
    let leaves = 0;
    let sections = 0;
    for (let i = 0; i < 6; i++) {
      src += `"top ${i}"\n`;
      sections++;
      for (let j = 0; j < 8; j++) {
        src += `  "mid ${i}.${j}"\n    "inner ${i}.${j}"\n`;
        sections += 2;
        for (let k = 0; k < 8; k++, leaves++) src += `      "leaf ${i}.${j}.${k}": ${1 + ((i * 64 + j * 8 + k) % 37) ** 3}\n`;
      }
    }
    const { svg } = render(src, options);
    expect(svg.match(/class="pele-node pele-leaf"/g)?.length).toBe(leaves);
    expect(svg.match(/class="pele-node pele-section"/g)?.length).toBe(sections);
  });

  it('fits text at the font size a class sets', () => {
    const { svg } = render(
      'treemap\n"A section with a long name":::head\n  "A leaf with a fairly long name": 30:::big\n  "Another leaf with a long name": 20:::big\n  "rest": 400\nclassDef big font-size:20px\nclassDef head font-size:18px',
      options
    );
    const groups = [...svg.matchAll(/<g class="pele-node pele-(leaf|section) (big|head)"[^>]*>(.*?)<\/g>/g)];
    expect(groups.length).toBe(3);
    for (const [, kind, , body] of groups) {
      const w = Number(/<rect[^>]* width="([\d.]+)"/.exec(body)![1]);
      const texts = [...body.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
      expect(texts.length).toBeGreaterThan(0);
      for (const text of texts) {
        const width = kind === 'leaf' ? metricsMeasurer.width(text, 20, 0) : metricsMeasurer.width(text, 18, Style.Bold);
        expect(width, text).toBeLessThanOrEqual(w - 8);
      }
    }
  });

  it('draws the title above, from the diagram or the front matter', () => {
    const titled = render('---\ntitle: From front matter\n---\n' + BASIC, options);
    expect(titled.svg).toContain('>From front matter<');
    expect(titled.height).toBeGreaterThan(416);
    const own = render('---\ntitle: From front matter\n---\ntreemap\ntitle Own\n"a": 1', options).svg;
    expect(own).toContain('>Own<');
    expect(own).not.toContain('From front matter');
  });

  it('renders an empty treemap and one with nothing to size', () => {
    for (const src of ['treemap', 'treemap\n"Only a section"', 'treemap\n"a": 0\n"b": .', 'treemap\n"a": ' + '9'.repeat(400)]) {
      const { svg } = render(src, options);
      expect(svg, src).toContain('<svg');
      expect(svg, src).not.toMatch(/NaN|Infinity|pele-node/);
    }
  });

  it('writes accessible names and ignores unusable config', () => {
    const { svg } = render('treemap\naccTitle: Name\naccDescr: Text\n"a": 1', options);
    expect(svg).toContain('<title id="pele-title">Name</title>');
    expect(svg).toContain('<desc id="pele-desc">Text</desc>');
    const odd = render(config('    nodeWidth: -3\n    nodeHeight: "x"\n    padding: 100000\n    valueFormat: 7', BASIC), options);
    expect(odd.svg).not.toMatch(/NaN|Infinity|width="-/);
  });
});
