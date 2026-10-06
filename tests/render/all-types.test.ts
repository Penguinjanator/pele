import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PeleError, render } from '../../src/index.js';
import { all } from '../../src/diagrams/registry.js';
import { metricsMeasurer } from '../../src/text/measurer.js';
import { PAYLOADS, assertInert } from '../support/inert.js';

const options = { measurer: metricsMeasurer };

// Mermaid's documentation examples for every diagram type.
const corpora = readdirSync('tests/corpus')
  .filter((file) => file.endsWith('-docs.json'))
  .sort()
  .map((file) => ({ name: file.replace('-docs.json', ''), sources: JSON.parse(readFileSync(`tests/corpus/${file}`, 'utf8')) as string[] }));

const where = (name: string, src: string): string => `${name}: ${JSON.stringify(src).slice(0, 120)}`;

describe('every diagram type', () => {
  it('has documentation examples', () => {
    const drawn = new Set<string>();
    for (const { sources } of corpora) for (const src of sources) drawn.add(render(src, options).type);
    expect([...drawn].sort()).toEqual(all.map((d) => d.type).sort());
  });

  it("draws all of Mermaid's documentation examples", { timeout: 120000 }, () => {
    let count = 0;
    for (const { name, sources } of corpora) {
      for (const src of sources) {
        const at = where(name, src);
        const { svg, width, height, type } = render(src, options);
        assertInert(svg, at);
        expect(svg, at).not.toMatch(/NaN|Infinity|undefined/);
        expect(svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" class="pele pele-${type}"`), at).toBe(true);
        // An example that asks Mermaid for a fixed size gets one.
        const fit = /useMaxWidth: false/.test(src) ? '' : 'max-width:100%;height:auto;';
        expect(svg, at).toContain(`viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="${fit}--_bg:`);
        expect(Number.isInteger(width) && Number.isInteger(height) && width >= 0 && height >= 0, at).toBe(true);
        expect(render(src, { ...options, responsive: false }).svg, at).not.toContain('max-width');
        expect(render(src, options).svg, at).toBe(svg);
        count++;
      }
    }
    expect(count).toBeGreaterThan(500);
  });

  it('draws a title given in front matter', () => {
    // Types whose documentation examples all carry a title of their own.
    const plain: Record<string, string> = {
      c4: 'C4Context\n  Person(a, "A")',
      cynefin: 'cynefin-beta\n  complex\n    "x"',
      journey: 'journey\n  section S\n    Task: 5: Me',
      packet: 'packet\n  0-15: "Source"',
      pie: 'pie\n  "a": 1\n  "b": 2',
      quadrant: 'quadrantChart\n  x-axis Low --> High\n  y-axis Low --> High\n  A: [0.3, 0.6]',
      radar: 'radar-beta\n  axis a, b, c\n  curve x{1,2,3}',
      timeline: 'timeline\n  2001 : a',
      wardley: 'wardley-beta\n  component A [0.5, 0.5]',
      xychart: 'xychart\n  x-axis [a, b]\n  bar [1, 2]',
    };
    const drawn = new Set<string>();
    for (const { name, sources } of corpora) {
      const src = plain[name] ?? sources.find((s) => !s.startsWith('---') && !/^\s*title\b/m.test(s));
      expect(src, name).toBeDefined();
      const { svg, type } = render(`---\ntitle: Zebra crossing\n---\n${src}`, options);
      expect(svg, name).toContain('Zebra crossing');
      assertInert(svg, name);
      drawn.add(type);
    }
    expect(drawn.size).toBe(all.length);
  });

  it('only gives ids that start with the prefix, so two diagrams on a page do not clash', () => {
    for (const { name, sources } of corpora) {
      for (const src of sources) {
        const { svg } = render(src, { ...options, idPrefix: 'one' });
        for (const m of svg.matchAll(/ id="([^"]*)"/g)) expect(m[1].startsWith('one'), `${where(name, src)}: id ${m[1]}`).toBe(true);
        for (const m of svg.matchAll(/url\(#([^)]*)\)|href="#([^"]*)"/g)) {
          expect((m[1] ?? m[2]).startsWith('one'), `${where(name, src)}: reference ${m[0]}`).toBe(true);
        }
      }
    }
  });

  it('reads entity codes in a link before checking it, so they cannot hide a scheme', () => {
    const links: [string, string][] = [
      ['flowchart', 'flowchart LR\n  A --> B\n  click A "URL"'],
      ['flowchart image', 'flowchart LR\n  A@{ img: "URL" }'],
      ['agentflow', 'agentflow-beta\n  A --> B\n  click A "URL"'],
      ['class', 'classDiagram\n  class A\n  click A href "URL"'],
      ['state', 'stateDiagram-v2\n  A --> B\n  click A href "URL"'],
      ['gantt', 'gantt\n  dateFormat YYYY-MM-DD\n  Task :a, 2024-01-01, 1d\n  click a href "URL"'],
      ['c4', 'C4Context\n  Person(a, "A", $link="URL")'],
    ];
    for (const [name, template] of links) {
      for (const hidden of ['#106;avascript:alert(1)', '&#106;avascript:alert(1)', 'java#9;script:alert(1)', '#32;javascript:alert(1)']) {
        const { svg } = render(template.replace('URL', hidden), options);
        const hrefs = (svg.match(/href="[^"]*"/g) ?? []).join(' ');
        expect(hrefs, `${name}: ${hidden}`).not.toMatch(/href="[^"#]*script/i);
        assertInert(svg, `${name}: ${hidden}`);
      }
      // C4 keeps the text of a link as written, so a code stays a harmless part of the address.
      const { svg } = render(template.replace('URL', 'https://example.com/a#35;b'), options);
      expect(svg, name).toContain(name === 'c4' ? 'href="https://example.com/a#35;b"' : 'href="https://example.com/a#b"');
    }
  });

  it('stays inert with hostile text in place of every quoted string and bracketed label', { timeout: 600000 }, () => {
    let rendered = 0;
    const payloads = PAYLOADS.filter((_, index) => index % 3 === 0);
    for (const { name, sources } of corpora) {
      for (const src of sources.slice(0, 12)) {
        for (const payload of payloads) {
          const variants = [
            src.replace(/"[^"\n]*"/g, () => `"${payload}"`),
            src.replace(/\[[^\]\n[]*\]/g, () => `[${payload}]`),
            src.replace(/: *[^\n:]+$/gm, () => `: ${payload}`),
          ];
          for (const variant of variants) {
            if (variant === src) continue;
            let svg: string;
            try {
              svg = render(variant, options).svg;
            } catch (error) {
              if (error instanceof PeleError) continue;
              throw new Error(`${where(name, variant)}: ${(error as Error).name}: ${(error as Error).message}`);
            }
            assertInert(svg, where(name, variant));
            expect(svg, where(name, variant)).not.toMatch(/NaN|Infinity/);
            rendered++;
          }
        }
      }
    }
    expect(rendered).toBeGreaterThan(2000);
  });
});
