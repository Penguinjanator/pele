import { describe, expect, it } from 'vitest';
import { PeleError, detectType, parse, render, supports } from '../../src/index.js';
import { resolveStyle } from '../../src/svg/theme.js';
import { metricsMeasurer } from '../../src/text/measurer.js';
import { loadCorpus } from '../support/corpus.js';
import { assertWellFormed } from '../support/xml.js';

const corpus = loadCorpus('flowchart', /graph|flowchart/);
const options = { measurer: metricsMeasurer };

function tryRender(src: string): string | undefined {
  try {
    return render(src, options).svg;
  } catch (error) {
    if (error instanceof PeleError) return undefined;
    throw error;
  }
}

describe('flowchart rendering', () => {
  it('renders every corpus input that parses, as well-formed and inert SVG', () => {
    let rendered = 0;
    for (const src of corpus) {
      const svg = tryRender(src);
      if (svg === undefined) continue;
      rendered++;
      const where = JSON.stringify(src).slice(0, 120);
      expect(() => assertWellFormed(svg), where).not.toThrow();
      expect(svg, where).not.toMatch(/<script|<style|<foreignObject|\son\w+=|javascript:/i);
      expect(svg, where).not.toContain('NaN');
      expect(svg, where).not.toContain('undefined');
      expect(tryRender(src), where).toBe(svg);
    }
    expect(rendered).toBeGreaterThan(300);
  });

  it('reports size and type', () => {
    const result = render('flowchart LR\n  A --> B', options);
    expect(result.type).toBe('flowchart');
    expect(result.width).toBeGreaterThan(100);
    expect(result.height).toBeGreaterThan(30);
    expect(result.svg).toContain(`viewBox="0 0 ${result.width} ${result.height}"`);
    expect(result.svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" class="pele pele-flowchart"/);
  });

  it('lays out along the declared direction', () => {
    const tall = render('flowchart TD\n  A --> B --> C', options);
    const wide = render('flowchart LR\n  A --> B --> C', options);
    expect(tall.height).toBeGreaterThan(tall.width);
    expect(wide.width).toBeGreaterThan(wide.height);
  });

  it('themes through custom properties with fallbacks and no style element', () => {
    const { svg } = render('flowchart TD\n  A --> B', options);
    for (const token of ['--pele-bg', '--pele-fg', '--pele-line', '--pele-surface', '--pele-border', '--pele-font']) {
      expect(svg).toContain(`var(${token},`);
    }
    expect(svg).not.toContain('<style');
  });

  it('escapes label text', () => {
    const { svg } = render('flowchart TD\n  A["<img src=x onerror=alert(1)> & more"]', options);
    expect(svg).not.toContain('<img');
    expect(svg).toContain('&amp; more');
    assertWellFormed(svg);
  });

  it('decodes entity codes and line breaks in labels', () => {
    const { svg } = render('flowchart TD\n  A["a #quot;b#quot; #35; #9829;<br/>second line"]', options);
    expect(svg).toContain('a &quot;b&quot; # ♥');
    expect(svg).toContain('second line');
    expect(svg.match(/<tspan/g)?.length).toBe(2);
  });

  it('wraps long labels', () => {
    const short = render('flowchart TD\n  A[one two]', options);
    const long = render('flowchart TD\n  A[one two three four five six seven eight nine ten eleven twelve]', options);
    expect(long.height).toBeGreaterThan(short.height);
    expect(long.width).toBeLessThan(300);
  });

  it('renders markdown emphasis', () => {
    const { svg } = render('flowchart TD\n  A["`This **is** _Markdown_`"]', options);
    expect(svg).toContain('<tspan font-weight="bold">is</tspan>');
    expect(svg).toContain('<tspan font-style="italic">Markdown</tspan>');
  });

  it('applies style, classDef and linkStyle', () => {
    const { svg } = render(
      'flowchart TD\n  A --> B\n  style A fill:#f9f,stroke:#333,stroke-width:4px,color:#fff\n  classDef warn fill:#ff0\n  class B warn\n  linkStyle 0 stroke:#f00,stroke-width:3px',
      options
    );
    expect(svg).toContain('style="fill:#f9f;stroke:#333;stroke-width:4px;"');
    expect(svg).toContain('style="fill:#fff;"');
    expect(svg).toMatch(/class="pele-node pele-shape-rect warn" data-id="B"/);
    expect(svg).toContain('style="stroke:#f00;stroke-width:3px;"');
    expect(svg).toContain('fill="#f00"');
  });

  it('drops style values that could load resources or break out of the attribute', () => {
    expect(resolveStyle(['fill:url(http://example.com/x.png)', 'stroke:red']).shape).toBe(' style="stroke:red;"');
    expect(resolveStyle(['fill:red;background:blue', 'color:expression(alert(1))']).shape).toBe('');
    expect(resolveStyle(['position:fixed', 'fill:"><script>']).shape).toBe('');
  });

  it('links nodes and neutralizes script URLs', () => {
    const result = render(
      'flowchart TD\n  A --> B --> C\n  click A "https://example.com" "A tooltip" _blank\n  click B "javascript:alert(1)"\n  click C call doSomething()',
      options
    );
    expect(result.svg).toContain('<a href="https://example.com/" target="_blank" rel="noopener">');
    expect(result.svg).toContain('<title>A tooltip</title>');
    expect(result.svg).toContain('href="about:blank"');
    expect(result.svg).not.toContain('doSomething');
    expect(result.links).toEqual([
      { id: 'A', href: 'https://example.com/', internal: false },
      { id: 'B', href: 'about:blank', internal: false },
    ]);
  });

  it('turns internal-link nodes into Obsidian links', () => {
    const result = render('flowchart TD\n  A[My note] --> B\n  class A internal-link;', options);
    expect(result.svg).toContain('<a class="internal-link" href="My note" data-href="My note">');
    expect(result.links).toEqual([{ id: 'A', href: 'My note', internal: true }]);
  });

  it('draws subgraphs as clusters behind their members', () => {
    const { svg } = render('flowchart TD\n  subgraph one [First group]\n    A --> B\n  end\n  B --> C', options);
    expect(svg).toMatch(/<g class="pele-cluster" data-id="one">/);
    expect(svg).toContain('First group');
    expect(svg.indexOf('pele-clusters')).toBeLessThan(svg.indexOf('pele-nodes'));
  });

  it('gives edges arrowheads without marker definitions', () => {
    const { svg } = render('flowchart LR\n  A --> B\n  B --- C\n  C --x D\n  D o--o E\n  E <--> F', options);
    expect(svg).not.toContain('<marker');
    expect(svg).not.toContain('<defs');
    expect(svg.match(/class="pele-marker"/g)?.length).toBe(6);
  });

  it('keeps invisible links out of the drawing but in the layout', () => {
    const linked = render('flowchart LR\n  A ~~~ B', options);
    const apart = render('flowchart LR\n  A\n  B', options);
    expect(linked.svg).not.toContain('pele-edge"');
    expect(linked.width).toBeGreaterThan(apart.width - 1);
    expect(linked.height).toBeLessThan(apart.height);
  });

  it('writes accessible title and description', () => {
    const { svg } = render('flowchart TD\n  accTitle: A title\n  accDescr: A description\n  A --> B', {
      ...options,
      idPrefix: 'd1',
    });
    expect(svg).toContain('<title id="d1-title">A title</title>');
    expect(svg).toContain('<desc id="d1-desc">A description</desc>');
    expect(svg).toContain('aria-labelledby="d1-title"');
  });

  it('scales to its container when asked', () => {
    const { svg, width } = render('flowchart TD\n  A --> B', { ...options, maxWidth: true });
    expect(svg).toContain('width="100%"');
    expect(svg).toContain(`max-width:${width}px`);
  });

  it('reads front matter and init directives', () => {
    const plain = render('flowchart TD\n  A --> B', options);
    const spaced = render('---\nconfig:\n  flowchart:\n    rankSpacing: 200\n---\nflowchart TD\n  A --> B', options);
    const directive = render('%%{init: {"flowchart": {"rankSpacing": 200}}}%%\nflowchart TD\n  A --> B', options);
    expect(spaced.height).toBeGreaterThan(plain.height + 100);
    expect(directive.height).toBe(spaced.height);
  });

  it('ignores comments', () => {
    const { svg } = render('flowchart TD\n  %% a comment\n  A --> B\n', options);
    expect(svg).not.toContain('comment');
  });
});

describe('public api', () => {
  it('detects diagram types', () => {
    expect(detectType('flowchart TD\n A')).toBe('flowchart');
    expect(detectType('  graph LR\n A')).toBe('flowchart');
    expect(detectType('%% comment\nsequenceDiagram\n A->>B: hi')).toBe('sequence');
    expect(detectType('---\ntitle: x\n---\nclassDiagram\n class A')).toBe('class');
    expect(detectType('hello')).toBe(null);
  });

  it('says what it can render', () => {
    expect(supports('flowchart TD\n A')).toBe(true);
    expect(supports('sequenceDiagram\n A->>B: hi')).toBe(false);
    expect(supports('nothing')).toBe(false);
  });

  it('throws structured errors', () => {
    const unsupported = (() => {
      try {
        render('zenuml\n A->B: hi');
      } catch (error) {
        return error as PeleError;
      }
    })();
    expect(unsupported).toBeInstanceOf(PeleError);
    expect(unsupported?.code).toBe('unsupported-diagram');
    expect(unsupported?.type).toBe(null);

    const syntax = (() => {
      try {
        render('flowchart TD\n  A --> B\n  C --> --> D\n  E');
      } catch (error) {
        return error as PeleError;
      }
    })();
    expect(syntax?.code).toBe('syntax');
    expect(syntax?.type).toBe('flowchart');
    expect(syntax?.line).toBe(3);
    expect(syntax?.message).toContain('Parse error on line 3');

    expect(() => render('flowchart TD\n  A --> B', { limit: 5 })).toThrow(/limit/);
  });

  it('parses without rendering', () => {
    const model = parse('flowchart LR\n  A[Start] --> B{Choice}');
    expect(model.type).toBe('flowchart');
    expect(model.direction).toBe('LR');
    expect([...model.nodes.keys()]).toEqual(['A', 'B']);
    expect(model.nodes.get('B')?.type).toBe('diamond');
    expect(model.edges[0]).toMatchObject({ start: 'A', end: 'B', type: 'arrow_point' });
  });
});
