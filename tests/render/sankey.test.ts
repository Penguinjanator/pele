import { describe, expect, it } from 'vitest';
import { PeleError, parse, render, supports } from '../../src/index.js';
import { metricsMeasurer } from '../../src/text/measurer.js';
import { loadCorpus } from '../support/corpus.js';
import { assertWellFormed } from '../support/xml.js';

const options = { measurer: metricsMeasurer };
const corpus = loadCorpus('sankey', /sankey/i);

const BASIC = 'sankey\na,b,5\na,c,3\nb,d,4\nc,d,1.239\n';

function configured(sankey: string, body = BASIC): string {
  return `---\nconfig:\n  sankey:\n${sankey
    .split('\n')
    .map((line) => '    ' + line)
    .join('\n')}\n---\n${body}`;
}

function count(svg: string, pattern: RegExp): number {
  return svg.match(pattern)?.length ?? 0;
}

function attr(svg: string, id: string, name: string): string {
  return new RegExp(`class="pele-sankey-node" data-id="${id}"[^>]* ${name}="([^"]*)"`).exec(svg)![1];
}

describe('sankey rendering', () => {
  it('renders every documentation example as well-formed SVG', () => {
    let rendered = 0;
    for (const src of corpus) {
      let svg: string;
      try {
        svg = render(src, options).svg;
      } catch (error) {
        expect(error).toBeInstanceOf(PeleError);
        continue;
      }
      rendered++;
      const where = JSON.stringify(src).slice(0, 120);
      expect(() => assertWellFormed(svg), where).not.toThrow();
      expect(svg, where).not.toContain('NaN');
      expect(svg, where).not.toContain('undefined');
      expect(svg, where).not.toContain('Infinity');
      expect(render(src, options).svg, where).toBe(svg);
    }
    expect(rendered).toBeGreaterThanOrEqual(8);
  });

  it('draws a bar and a label per node and a band per link', () => {
    const { svg, type } = render(BASIC, options);
    expect(type).toBe('sankey');
    expect(supports('sankey\na,b,1')).toBe(true);
    expect(supports('sankey-beta\na,b,1')).toBe(true);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" class="pele pele-sankey"/);
    expect(count(svg, /class="pele-sankey-node"/g)).toBe(4);
    expect(count(svg, /class="pele-sankey-link"/g)).toBe(4);
    expect(count(svg, /class="pele-label"/g)).toBe(4);
    expect(svg).toContain('data-id="a-&gt;b"');
    expect(svg).toContain('<title>a → b: 5</title>');
  });

  it('colors bars by series, in the order nodes first appear', () => {
    const { svg } = render(BASIC, options);
    expect(attr(svg, 'a', 'fill')).toBe('var(--pele-series-1,#4c78a8)');
    expect(attr(svg, 'b', 'fill')).toBe('var(--pele-series-2,#f58518)');
    expect(attr(svg, 'd', 'fill')).toBe('var(--pele-series-4,#e45756)');
  });

  it('has the default size of 600 by 400 plus padding', () => {
    const { width, height } = render(BASIC, options);
    expect(width).toBe(616);
    expect(height).toBe(416);
  });

  it('honours width and height', () => {
    const { width, height, svg } = render(configured('width: 300\nheight: 150'), options);
    expect(width).toBe(316);
    expect(height).toBe(166);
    expect(Number(attr(svg, 'd', 'x'))).toBe(290);
  });

  it('shows values with two decimals, a prefix and a suffix, unless showValues is off', () => {
    const shown = render(BASIC, options).svg;
    expect(shown).toContain('>a <tspan class="pele-sankey-value" fill="var(--_m)">8</tspan><');
    expect(shown).toContain('>5.24</tspan>');
    const money = render(configured('prefix: "$"\nsuffix: " M"'), options).svg;
    expect(money).toContain('>$8 M</tspan>');
    expect(money).toContain('<title>a → b: $5 M</title>');
    const hidden = render(configured('showValues: false'), options).svg;
    expect(hidden).not.toContain('pele-sankey-value');
    expect(hidden).toContain('>a</text>');
  });

  it('gives nodes more room when values are shown, as Mermaid does', () => {
    const body = 'sankey\na,b,1\na,c,1\na,d,1\n';
    const gap = (svg: string): number => Number(attr(svg, 'c', 'y')) - Number(attr(svg, 'b', 'y')) - Number(attr(svg, 'b', 'height'));
    expect(gap(render(body, options).svg)).toBeCloseTo(27, 1);
    expect(gap(render(configured('showValues: false', body), options).svg)).toBeGreaterThanOrEqual(12);
    expect(gap(render(configured('showValues: false\nnodePadding: 40', body), options).svg)).toBeCloseTo(40, 1);
  });

  it('honours nodeAlignment', () => {
    const body = 'sankey\na,b,4\nb,c,3\nc,d,3\nx,d,2\na,y,1\n';
    const x = (alignment: string, id: string): number => Number(attr(render(configured(`nodeAlignment: ${alignment}`, body), options).svg, id, 'x'));
    expect(x('justify', 'y')).toBe(590);
    expect(x('left', 'y')).toBeCloseTo(590 / 3, 1);
    expect(x('left', 'x')).toBe(0);
    expect(x('right', 'x')).toBeCloseTo((590 * 2) / 3, 1);
    expect(x('center', 'x')).toBeCloseTo((590 * 2) / 3, 1);
    expect(x('center', 'y')).toBeCloseTo(590 / 3, 1);
    expect(x('nonsense', 'y')).toBe(590);
  });

  it('honours linkColor', () => {
    const link = (svg: string): string => /class="pele-sankey-link" data-id="a-&gt;b"[^>]*/.exec(svg)![0];
    // A gradient needs definitions, which the output never has, so it falls back to the source colour.
    expect(link(render(BASIC, options).svg)).toContain('fill="var(--pele-series-1,#4c78a8)"');
    expect(link(render(configured('linkColor: gradient'), options).svg)).toContain('fill="var(--pele-series-1,#4c78a8)"');
    expect(link(render(configured('linkColor: source'), options).svg)).toContain('fill="var(--pele-series-1,#4c78a8)"');
    expect(link(render(configured('linkColor: target'), options).svg)).toContain('fill="var(--pele-series-2,#f58518)"');
    expect(link(render(configured('linkColor: "#a1a1a1"'), options).svg)).toContain('style="fill:#a1a1a1;"');
    expect(link(render(configured('linkColor: "url(#x)"'), options).svg)).not.toContain('style=');
    expect(render(BASIC, options).svg).not.toMatch(/<defs|<linearGradient|url\(/);
    expect(render(BASIC, options).svg).toContain('class="pele-sankey-links" fill-opacity="0.4"');
  });

  it('honours nodeWidth, nodeColors and labelStyle', () => {
    expect(attr(render(configured('nodeWidth: 24'), options).svg, 'a', 'width')).toBe('24');
    const colored = render(configured('linkColor: source\nnodeColors:\n  a: "#123456"\n  d: "url(#x)"\n  __proto__: red'), options).svg;
    expect(colored).toMatch(/class="pele-sankey-node" data-id="a"[^>]*style="fill:#123456;"/);
    expect(colored).toMatch(/class="pele-sankey-link" data-id="a-&gt;b"[^>]*style="fill:#123456;"/);
    expect(colored).not.toContain('url(');
    const legacy = render(BASIC, options).svg;
    const outlined = render(configured('labelStyle: outlined'), options);
    expect(legacy).toMatch(/data-id="d"><text[^>]*text-anchor="end"/);
    expect(outlined.svg).toMatch(/data-id="d"><text[^>]*text-anchor="start"[^>]*stroke="var\(--_bg\)"/);
    expect(outlined.width).toBeGreaterThan(616);
  });

  it('puts each label on the side of its bar that faces the middle', () => {
    const { svg } = render(BASIC, options);
    expect(svg).toMatch(/data-id="a"><text[^>]*text-anchor="start"/);
    expect(svg).toMatch(/data-id="d"><text[^>]*text-anchor="end"/);
  });

  it('grows the picture to hold labels that reach outside the chart', () => {
    const { width, svg } = render(configured('labelStyle: outlined', 'sankey\nA,Somewhere with a very long name indeed,1\n'), options);
    expect(width).toBeGreaterThan(800);
    expect(svg).toContain(`viewBox="0 0 ${width} `);
  });

  it('keeps quoted fields, escaped quotes and odd characters as node names', () => {
    const model = parse('sankey\n"Heating, ""homes""",Agricultural \'waste\',1\n  Lighting & appliances - commercial  , Over generation / exports ,2\n');
    expect(model.type).toBe('sankey');
    if (model.type === 'sankey') {
      expect(model.nodes.map((node) => node.id)).toEqual(['Heating, "homes"', "Agricultural 'waste'", 'Lighting & appliances - commercial', 'Over generation / exports']);
      expect(model.links.map((link) => [link.source.id, link.target.id, link.value])).toEqual([
        ['Heating, "homes"', "Agricultural 'waste'", 1],
        ['Lighting & appliances - commercial', 'Over generation / exports', 2],
      ]);
    }
    const { svg } = render('sankey\n"Heating, ""homes""",Lighting & appliances,1\n', options);
    expect(svg).toContain('>Heating, &quot;homes&quot; <tspan');
    expect(svg).toContain('>Lighting &amp; appliances <tspan');
  });

  it('accepts comments, blank lines and both keywords', () => {
    const a = render('sankey-beta\n\n%% source,target,value\na,b,1\n\n\nb,c,2\n', options).svg;
    const b = render('sankey\na,b,1\nb,c,2', options).svg;
    expect(a).toBe(b);
  });

  it('draws the front matter title', () => {
    const plain = render(BASIC, options);
    const titled = render(`---\ntitle: Energy flows\n---\n${BASIC}`, options);
    expect(titled.svg).toContain('class="pele-title"');
    expect(titled.svg).toContain('>Energy flows<');
    expect(titled.height).toBeGreaterThan(plain.height);
  });

  it('rejects circular links at render time, as d3-sankey fails on them', () => {
    expect(() => render('sankey\na,b,1\nb,c,1\nc,a,1\n', options)).toThrow(/circular links.*"[abc]" is part of one/);
    expect(() => render('sankey\na,a,1\n', options)).toThrow(PeleError);
    expect(parse('sankey\na,b,1\nb,a,1\n').type).toBe('sankey');
  });

  it('rejects what Mermaid rejects', () => {
    for (const src of ['sankey\n', 'sankey\na,b\n', 'sankey\na,b,1,2\n', 'sankey\na,,1\n', 'sankey\n"",b,1\n', 'sankey\na,b,1\n   \nc,d,2\n', 'sankey\nCafé,Bar,1\n', 'sankey x\na,b,1\n']) {
      expect(() => render(src, options), src).toThrow(PeleError);
    }
    expect(() => render('sankey\na,b\n', options)).toThrow(/Expecting 'COMMA', 'NEWLINE', 'EOF', got 'EOF'|Expecting 'COMMA'/);
  });

  it('draws values that are not usable numbers as empty flows', () => {
    const { svg } = render('sankey\na,b,abc\na,c,-3\nb,d,0\nc,d,2\n', options);
    expect(svg).not.toContain('NaN');
    expect(count(svg, /class="pele-sankey-link"/g)).toBe(4);
    expect(svg).toContain('<title>a → b: 0</title>');
  });
});
