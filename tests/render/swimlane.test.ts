import { describe, expect, it } from 'vitest';
import { PeleError, detectType, parse, render, supports } from '../../src/index.js';
import type { FlowchartModel } from '../../src/index.js';
import { metricsMeasurer } from '../../src/text/measurer.js';
import { loadCorpus } from '../support/corpus.js';
import { PAYLOADS, assertInert } from '../support/inert.js';
import { assertWellFormed } from '../support/xml.js';

const options = { measurer: metricsMeasurer };
const svgOf = (src: string, extra: object = {}): string => render(src, { ...options, ...extra }).svg;
const count = (svg: string, needle: string): number => svg.split(needle).length - 1;

const ORDER = `swimlane-beta LR
  subgraph Customer
    browse[Browse] --> pay[Pay]
  end
  subgraph Warehouse
    pick[Pick] --> ship[Ship]
  end
  pay -- paid --> pick`;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// The outline of each lane and the center of each node, read back from the SVG.
function lanes(svg: string): Map<string, Box> {
  const out = new Map<string, Box>();
  for (const m of svg.matchAll(/<g class="pele-cluster pele-lane[^"]*" data-id="([^"]*)"><rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
    out.set(m[1], { x: Number(m[2]), y: Number(m[3]), w: Number(m[4]), h: Number(m[5]) });
  }
  return out;
}
function centers(svg: string): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (const m of svg.matchAll(/<g class="pele-node[^"]*" data-id="([^"]*)" transform="translate\(([-\d.]+),([-\d.]+)\)"/g)) {
    out.set(m[1], [Number(m[2]), Number(m[3])]);
  }
  return out;
}
const inside = (p: [number, number], b: Box): boolean => p[0] > b.x && p[0] < b.x + b.w && p[1] > b.y && p[1] < b.y + b.h;

describe('swimlane rendering', () => {
  it('is detected and supported', () => {
    expect(detectType(ORDER)).toBe('swimlane');
    expect(supports(ORDER)).toBe(true);
    expect(render(ORDER, options).type).toBe('swimlane');
    expect(detectType('swimlane-betax\n a --> b')).not.toBe('swimlane');
  });

  it('reads the same model as a flowchart with the same body', () => {
    const lane = parse(ORDER) as FlowchartModel;
    const flow = parse(ORDER.replace('swimlane-beta', 'flowchart')) as FlowchartModel;
    expect([...lane.nodes.keys()]).toEqual([...flow.nodes.keys()]);
    expect(lane.edges.map((e) => [e.start, e.end, e.text])).toEqual(flow.edges.map((e) => [e.start, e.end, e.text]));
    expect(lane.subgraphs.map((s) => [s.id, s.nodes])).toEqual(flow.subgraphs.map((s) => [s.id, s.nodes]));
    expect(lane.direction).toBe('LR');
  });

  it('rejects what the flowchart grammar rejects', () => {
    expect(() => render('swimlane-beta LR\n  a --> ', options)).toThrow(PeleError);
    expect(() => render('swimlane-beta LR\n  subgraph x\n  a', options)).toThrow(PeleError);
  });

  it('draws one lane per top-level subgraph and keeps each node in its lane', () => {
    const svg = svgOf(ORDER);
    assertWellFormed(svg);
    expect(svg).toContain('class="pele pele-swimlane"');
    expect(svg).toContain('aria-roledescription="swimlane"');
    const boxes = lanes(svg);
    const at = centers(svg);
    expect([...boxes.keys()]).toEqual(['Warehouse', 'Customer']);
    expect(inside(at.get('browse')!, boxes.get('Customer')!)).toBe(true);
    expect(inside(at.get('pay')!, boxes.get('Customer')!)).toBe(true);
    expect(inside(at.get('pick')!, boxes.get('Warehouse')!)).toBe(true);
    expect(inside(at.get('ship')!, boxes.get('Warehouse')!)).toBe(true);
    expect(svg).toContain('>paid<');
  });

  it('stacks lanes down the page when the flow runs sideways, and across it otherwise', () => {
    const sideways = lanes(svgOf(ORDER));
    expect(sideways.get('Customer')!.y).toBeLessThan(sideways.get('Warehouse')!.y);
    expect(sideways.get('Customer')!.x).toBe(sideways.get('Warehouse')!.x);
    expect(svgOf(ORDER)).toContain('transform="rotate(-90 ');
    const down = lanes(svgOf(ORDER.replace('LR', 'TD')));
    expect(down.get('Customer')!.x).toBeLessThan(down.get('Warehouse')!.x);
    expect(down.get('Customer')!.y).toBe(down.get('Warehouse')!.y);
    expect(svgOf(ORDER.replace('LR', 'TD'))).not.toContain('rotate(');
  });

  it('lines up steps of the same rank across lanes', () => {
    const at = centers(svgOf('swimlane-beta TD\n  subgraph A\n    a1 --> a2\n  end\n  subgraph B\n    b1 --> b2\n  end\n  a1 --> b2'));
    expect(at.get('a1')![1]).toBe(at.get('b1')![1]);
    expect(at.get('a2')![1]).toBe(at.get('b2')![1]);
    expect(at.get('a1')![0]).toBe(at.get('a2')![0]);
  });

  it('follows every direction', () => {
    const y = (dir: string, id: string): number => centers(svgOf(`swimlane-beta ${dir}\n  subgraph L\n    a --> b\n  end`)).get(id)![1];
    const x = (dir: string, id: string): number => centers(svgOf(`swimlane-beta ${dir}\n  subgraph L\n    a --> b\n  end`)).get(id)![0];
    expect(y('TB', 'a')).toBeLessThan(y('TB', 'b'));
    expect(y('BT', 'a')).toBeGreaterThan(y('BT', 'b'));
    expect(x('LR', 'a')).toBeLessThan(x('LR', 'b'));
    expect(x('RL', 'a')).toBeGreaterThan(x('RL', 'b'));
  });

  it('gives nodes outside every lane a lane of their own', () => {
    const svg = svgOf('swimlane-beta TD\n  start --> a\n  subgraph Team\n    a --> b\n  end');
    const boxes = lanes(svg);
    expect(boxes.size).toBe(2);
    const loose = [...boxes.keys()].find((id) => id !== 'Team')!;
    expect(inside(centers(svg).get('start')!, boxes.get(loose)!)).toBe(true);
    expect(boxes.get(loose)!.x).toBeLessThan(boxes.get('Team')!.x);
    expect(lanes(svgOf('swimlane-beta TD\n  a --> b')).size).toBe(1);
  });

  it('draws an empty lane and a group inside a lane', () => {
    const svg = svgOf('swimlane-beta TD\n  subgraph One\n    subgraph Inner\n      a --> b\n    end\n    c\n  end\n  subgraph Two\n  end\n  b --> c');
    expect(lanes(svg).size).toBe(2);
    expect(count(svg, 'class="pele-cluster"')).toBe(1);
    expect(svg).toContain('>Inner<');
  });

  it('ignores a direction inside a lane', () => {
    const plain = svgOf('swimlane-beta TD\n  subgraph L\n    a --> b\n  end');
    const turned = svgOf('swimlane-beta TD\n  subgraph L\n    direction LR\n    a --> b\n  end');
    expect(turned).toBe(plain);
  });

  it('keeps flowchart features: shapes, styles, links, titles and accessible names', () => {
    const svg = svgOf(
      '---\ntitle: Orders\n---\nswimlane-beta LR\n  accTitle: Order flow\n  accDescr: Who does what\n  subgraph L[Lane **one**]\n    a{Choice} --> b[(Store)]\n    b --> b\n  end\n  click a "https://example.com" "tip"\n  style a fill:#f00\n  classDef hot stroke:#0f0\n  class b hot\n  style L fill:#00f'
    );
    assertWellFormed(svg);
    expect(svg).toContain('pele-shape-');
    expect(svg).toContain('>Orders<');
    expect(svg).toContain('<title id="pele-title">Order flow</title>');
    expect(svg).toContain('href="https://example.com/"');
    expect(svg).toContain('fill:#f00');
    expect(svg).toContain('fill:#00f');
    expect(render('swimlane-beta LR\n  a\n  click a "https://example.com"', options).links).toEqual([{ id: 'a', href: 'https://example.com/', internal: false }]);
  });

  it('reads spacing from the swimlane config, then the flowchart config', () => {
    const src = 'swimlane-beta TD\n  subgraph L\n    a --> b\n  end';
    const plain = render(src, options).height;
    expect(render(`---\nconfig:\n  swimlane:\n    rankSpacing: 200\n---\n${src}`, options).height).toBeGreaterThan(plain + 100);
    expect(render(`---\nconfig:\n  flowchart:\n    rankSpacing: 200\n---\n${src}`, options).height).toBeGreaterThan(plain + 100);
  });

  it('shrinks to its container unless told not to', () => {
    expect(svgOf(ORDER)).toContain('max-width:100%;height:auto;');
    expect(svgOf(ORDER, { responsive: false })).not.toContain('max-width');
  });

  it('is the same every time', () => {
    expect(svgOf(ORDER)).toBe(svgOf(ORDER));
  });

  it("renders Mermaid's documentation examples", () => {
    const corpus = loadCorpus('swimlane', /swimlane-beta/);
    expect(corpus.length).toBeGreaterThan(8);
    for (const src of corpus) {
      const svg = svgOf(src);
      assertInert(svg, src.slice(0, 80));
      expect(lanes(svg).size, src.slice(0, 80)).toBeGreaterThan(0);
    }
  });
});

const TEMPLATES: ((p: string) => string)[] = [
  (p) => `swimlane-beta TD\n  subgraph L["${p}"]\n    a\n  end`,
  (p) => `swimlane-beta LR\n  subgraph L["${p}"]\n    a["${p}"] -- "${p}" --> b\n  end`,
  (p) => `swimlane-beta TD\n  subgraph ${p}\n    a\n  end`,
  (p) => `swimlane-beta ${p}\n  a --> b`,
  (p) => `swimlane-beta TD\n  subgraph L\n    a\n  end\n  style L ${p}\n  class L ${p}`,
  (p) => `swimlane-beta LR\n  subgraph L\n    a\n  end\n  click a "${p}" "${p}"\n  L:::${p}`,
  (p) => `---\ntitle: "${p}"\nconfig:\n  swimlane: "${p}"\n---\nswimlane-beta TD\n  a`,
  (p) => `swimlane-beta RL\n  subgraph L["\`**${p}**\`"]\n    a\n  end\n  accTitle: ${p}\n  accDescr: ${p}`,
];

describe('inert swimlane output', () => {
  it('holds with hostile text in every position', { timeout: 120000 }, () => {
    let rendered = 0;
    for (const template of TEMPLATES) {
      for (const payload of PAYLOADS) {
        let svg: string;
        try {
          svg = svgOf(template(payload));
        } catch (error) {
          if (error instanceof PeleError) continue;
          throw error;
        }
        assertInert(svg, JSON.stringify(template(payload)).slice(0, 160));
        expect(svg).not.toMatch(/NaN|Infinity/);
        rendered++;
      }
    }
    expect(rendered).toBeGreaterThan(40);
  });

  it('handles lane names that are object keys', () => {
    for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      const svg = svgOf(`swimlane-beta TD\n  subgraph ${name}\n    a --> b\n  end\n  subgraph other\n    c\n  end\n  b --> c`);
      assertInert(svg, name);
      expect(lanes(svg).size).toBe(2);
    }
  });
});
