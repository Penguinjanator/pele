import { describe, expect, it } from 'vitest';
import { render } from '../../src/index.js';
import { metricsMeasurer } from '../../src/text/measurer.js';
import { assertInert } from '../support/inert.js';

const FLOW = 'flowchart LR\n  A --> B';
const root = (options: object = {}): string => /^<svg[^>]*>/.exec(render(FLOW, { measurer: metricsMeasurer, ...options }).svg)![0];

describe('fonts', () => {
  it('draws in generic fonts unless told what was measured', () => {
    expect(root()).toContain(';--_fm:var(--pele-font-mono,monospace);font:16px sans-serif;');
    expect(root()).toMatch(/;font-family:var\(--pele-font,sans-serif\)"/);
    expect(root()).not.toContain(' font-family=');
  });

  it('draws in the fonts it measured with, where the page names no others', () => {
    const drawn = root({ fontFamily: '"Segoe UI", system-ui, sans-serif', fontFamilyMono: "'SF Mono', ui-monospace" });
    expect(drawn).toContain('font-family:var(--pele-font,&quot;Segoe UI&quot;, system-ui, sans-serif)"');
    expect(drawn).toContain("--_fm:var(--pele-font-mono,'SF Mono', ui-monospace);");
    expect(root({ fontFamily: '思源黑体, sans-serif' })).toContain('var(--pele-font,思源黑体, sans-serif)');
    // Obsidian's lists start with placeholders for the fonts a user or a theme has not set.
    expect(root({ fontFamily: '"??", "??", ui-sans-serif, -apple-system, system-ui' })).toContain(
      'var(--pele-font,&quot;??&quot;, &quot;??&quot;, ui-sans-serif, -apple-system, system-ui)'
    );
  });

  it('pins what text would inherit from the page and was not measured', () => {
    for (const pinned of ['letter-spacing:normal', 'word-spacing:normal', 'text-transform:none', 'direction:ltr']) {
      expect(root()).toContain(`;${pinned};`);
    }
  });

  it('does not write a font list that is more than names', () => {
    for (const family of ['x;color:red', 'x) ; y', 'url(//evil.example/f)', '"url(x)"', '"open', "it's", 'a\nb', 'x{}', '<b>', '"a";"b"', 'a,,b', ', a', '']) {
      const svg = render(FLOW, { measurer: metricsMeasurer, fontFamily: family, fontFamilyMono: family }).svg;
      expect(svg, family).toContain('font-family:var(--pele-font,sans-serif)"');
      expect(svg, family).toContain('--_fm:var(--pele-font-mono,monospace);');
      assertInert(svg, family);
    }
  });
});
