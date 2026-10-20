import { describe, expect, it } from 'vitest';
import { render, type MathMarkup } from '../../src/index.js';
import { metricsMeasurer } from '../../src/text/measurer.js';
import { assertWellFormed } from '../support/xml.js';

const options = { measurer: metricsMeasurer };

function recorder(markup: (tex: string, size: number) => MathMarkup | null = (tex) => ({ svg: `<path d="M0,0H${tex.length}"/>`, width: 30, height: 18 })) {
  const asked: [string, number][] = [];
  const math = (tex: string, size: number): MathMarkup | null => {
    asked.push([tex, size]);
    return markup(tex, size);
  };
  return { asked, math };
}

const boxes = (svg: string): string[] => svg.match(/<(?:svg|foreignObject) class="pele-math"[^>]*>/g) ?? [];

describe('math in labels', () => {
  it('leaves $$ as text without a resolver', () => {
    const { svg } = render('flowchart LR\n  A["$$x^2$$"]', options);
    expect(svg).toContain('$$x^2$$');
    expect(svg).not.toContain('pele-math');
  });

  it('draws the same as without a resolver when the resolver has nothing', () => {
    const src = 'flowchart LR\n  A["$$x^2$$ and text"] -->|"$$y$$"| B';
    const plain = render(src, options).svg;
    expect(render(src, { ...options, math: () => null }).svg).toBe(plain);
    expect(render(src, { ...options, math: () => ({ svg: '', width: NaN, height: 10 }) }).svg).toBe(plain);
    expect(render(src, { ...options, math: () => ({ svg: '', width: 10, height: -1 }) }).svg).toBe(plain);
  });

  it('gives the resolver the TeX as written and the label font size', () => {
    const { asked, math } = recorder();
    render('flowchart LR\n  A["$$a \\neq b_1 < c * d$$"] -->|"$$e^#35;$$"| B', { ...options, math });
    expect(asked).toEqual([
      ['a \\neq b_1 < c * d', 16],
      ['e^#', 14],
    ]);
  });

  it('asks once for an expression used again at the same size', () => {
    const { asked, math } = recorder();
    render('flowchart LR\n  A["$$x$$"] --> B["$$x$$"] --> C["$$x$$"]', { ...options, math });
    expect(asked).toEqual([['x', 16]]);
  });

  it('draws SVG markup in a box of the size the resolver gives', () => {
    const { math } = recorder(() => ({ svg: '<path d="M1,1H9"/>', width: 40, height: 50 }));
    const drawn = render('flowchart LR\n  A["$$\\frac{a}{b}$$"]', { ...options, math });
    const plain = render('flowchart LR\n  A["x"]', options);
    expect(boxes(drawn.svg)).toEqual(['<svg class="pele-math" x="-20" y="-25" width="40" height="50" overflow="visible">']);
    expect(drawn.svg).toContain('overflow="visible"><path d="M1,1H9"/></svg>');
    expect(drawn.svg).not.toContain('$$');
    expect(drawn.height).toBeGreaterThan(plain.height + 25);
    assertWellFormed(drawn.svg);
  });

  it('draws HTML markup in a foreignObject at the label font size', () => {
    const { math } = recorder(() => ({ html: '<span class="katex">x<br></span>', width: 20, height: 18 }));
    const { svg } = render('flowchart LR\n  A["$$x$$"]', { ...options, math });
    expect(boxes(svg)).toEqual(['<foreignObject class="pele-math" x="-10" y="-9" width="20" height="18" overflow="visible">']);
    expect(svg).toMatch(/<div xmlns="http:\/\/www.w3.org\/1999\/xhtml" style="[^"]*font-size:16px;[^"]*"><span class="katex">x<br><\/span><\/div><\/foreignObject>/);
  });

  it('sets math on the line among the text around it', () => {
    const { math } = recorder(() => ({ svg: '', width: 30, height: 40 }));
    const { svg } = render('flowchart LR\n  A["Total $$x$$ items<br/>last line"]', { ...options, math });
    const total = /<tspan x="([-\d.]+)" y="([-\d.]+)" text-anchor="start">Total <\/tspan>/.exec(svg)!;
    const items = /<tspan x="([-\d.]+)" y="([-\d.]+)" text-anchor="start"> items<\/tspan>/.exec(svg)!;
    const box = /<svg class="pele-math" x="([-\d.]+)" y="([-\d.]+)" width="30" height="40"/.exec(svg)!;
    const last = /<tspan x="0" y="([-\d.]+)">last line<\/tspan>/.exec(svg)!;
    expect(Number(items[1]) - Number(box[1])).toBe(30);
    expect(total[2]).toBe(items[2]);
    const middle = Number(box[2]) + 20;
    expect(Math.abs(Number(total[2]) - 16 * 0.35 - middle)).toBeLessThan(0.02);
    expect(Number(last[1])).toBeGreaterThan(Number(box[2]) + 40);
  });

  it('keeps an expression whole when a label wraps', () => {
    const { math } = recorder((tex) => ({ svg: '', width: tex.length * 10, height: 18 }));
    const { svg } = render('flowchart TD\n  A["some words before $$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa$$ and after it"]', {
      ...options,
      math,
      config: { flowchart: { wrappingWidth: 120 } },
    });
    expect(boxes(svg)).toHaveLength(1);
    expect(boxes(svg)[0]).toContain('width="300"');
  });

  it('draws math in sequence messages, participants and notes', () => {
    const { asked, math } = recorder();
    const { svg } = render('sequenceDiagram\n  participant A as $$\\alpha$$\n  A->>B: Solve $$x^2$$\n  Note over A: $$\\int x$$', { ...options, math });
    expect(asked.map(([tex]) => tex).sort()).toEqual(['\\alpha', '\\int x', 'x^2']);
    expect(svg).not.toContain('$$');
    assertWellFormed(svg);
  });

  it('draws math in swimlanes', () => {
    const { asked, math } = recorder();
    render('swimlane-beta LR\n  subgraph L["$$\\lambda$$"]\n    A["$$a$$"]\n  end', { ...options, math });
    expect(asked.map(([tex]) => tex).sort()).toEqual(['\\lambda', 'a']);
  });

  it('leaves other diagram types alone', () => {
    const { asked, math } = recorder();
    const src = 'pie\n  "$$x$$" : 3';
    expect(render(src, { ...options, math }).svg).toBe(render(src, options).svg);
    render('classDiagram\n  class A["$$x$$"]', { ...options, math });
    expect(asked).toEqual([]);
  });

  it('colors math as the label text', () => {
    const { math } = recorder();
    const { svg } = render('flowchart LR\n  A["$$x$$"]\n  classDef red color:#c00\n  class A red', { ...options, math });
    expect(boxes(svg)[0]).toContain(' color="#c00"');
  });

  it('colors math in a styled lane as its title', () => {
    const { math } = recorder();
    const { svg } = render('swimlane-beta LR\n  subgraph L["$$x$$"]\n    A\n  end\n  style L color:#c00', { ...options, math });
    expect(boxes(svg)[0]).toContain(' color="#c00"');
  });

  it('draws a cluster title once, not again in its outline', () => {
    const { math } = recorder();
    const { svg } = render('flowchart LR\n  subgraph S["$$x$$"]\n    A\n  end', { ...options, math });
    expect(boxes(svg)).toHaveLength(1);
    expect(boxes(svg)[0]).toContain(' color="var(--_m)"');
  });

  it('matches each expression lazily, within one line', () => {
    const { asked, math } = recorder();
    render('flowchart LR\n  A["$$a$$ and $$b$$<br/>$$c<br/>d$$"]', { ...options, math });
    expect(asked.map(([tex]) => tex)).toEqual(['a', 'b', 'c<br/>d']);
  });

  it('keeps each expression in its place when a tag drops another', () => {
    const { math } = recorder((tex) => ({ svg: `<g id="${tex}"/>`, width: 10, height: 18 }));
    const { svg } = render('flowchart LR\n  A["<span title=$$a$$>hello</span> $$b$$ $$c$$"]', { ...options, math });
    expect(svg).not.toContain('<g id="a"/>');
    const b = /<svg class="pele-math" x="([-\d.]+)"[^>]*><g id="b"\/>/.exec(svg)!;
    const c = /<svg class="pele-math" x="([-\d.]+)"[^>]*><g id="c"\/>/.exec(svg)!;
    expect(Number(c[1])).toBeGreaterThan(Number(b[1]));
  });

  it('shows unresolved expressions as TeX among resolved ones in markdown', () => {
    const { math } = recorder((tex) => (tex === 'b' ? null : { svg: '', width: 10, height: 18 }));
    const { svg } = render('flowchart LR\n  A["`**bold** $$a_1$$ and $$b$$ *c*`"]', { ...options, math });
    expect(boxes(svg)).toHaveLength(1);
    expect(svg).toContain('$$b$$');
    expect(svg).toContain('font-weight="var(--_w)"');
    expect(svg).toContain('font-style="italic"');
  });

  it('gives math the label opacity, but not styles that would change its size', () => {
    const { math } = recorder();
    const { svg } = render('flowchart LR\n  A["Hide $$x$$"]\n  style A opacity:0,letter-spacing:6px,word-spacing:4px', { ...options, math });
    expect(boxes(svg)[0]).toContain(' opacity="0"');
    expect(boxes(svg)[0]).not.toContain('spacing');
  });

  it('draws a patch behind math in a cluster title an edge runs through', () => {
    const { math } = recorder(() => ({ svg: '<g id="title"/>', width: 200, height: 18 }));
    const { svg } = render('flowchart TD\n  X --> A\n  subgraph S["$$x$$"]\n    A\n  end', { ...options, math });
    const title = /<g class="pele-cluster-title"[^>]*>(.*?)<\/g><\/g>|<g class="pele-cluster-title"[^>]*>.*?(?=<g class="pele-node|$)/.exec(svg)?.[0] ?? '';
    expect(title).toMatch(/<rect x="[-\d.]+" y="[-\d.]+" width="200" height="18" rx="2" fill="color-mix\(/);
    expect(svg.match(/<g id="title"\/>/g)).toHaveLength(1);
  });

  it('is not confused by a render inside the resolver', () => {
    const icons = (name: string): string => `<path data-name="${name}"/>`;
    const math = (tex: string): MathMarkup => {
      render('flowchart LR\n  B["fa:fa-star <b></b> $$y$$"]', { ...options, icons });
      return { svg: `<g id="${tex}"/>`, width: 10, height: 18 };
    };
    const { svg } = render('flowchart LR\n  A["$$x$$ fa:fa-car"]', { ...options, icons, math });
    expect(svg.match(/data-icon="fa:fa-car"/g)).toHaveLength(1);
    expect(svg).not.toContain('fa-star');
    expect(svg).toContain('<g id="x"/>');
  });

  it('recovers when the resolver throws', () => {
    const src = 'flowchart LR\n  A["$$x$$"]';
    expect(() => render(src, { ...options, math: () => { throw new Error('no'); } })).toThrow('no');
    expect(render('flowchart LR\n  A["<b></b>"]', options).svg).toContain('');
    expect(boxes(render(src, { ...options, math: recorder().math }).svg)).toHaveLength(1);
  });

  it('makes room for tall math in a sequence message that breaks', () => {
    const tall = recorder(() => ({ svg: '', width: 40, height: 60 }));
    const short = recorder(() => ({ svg: '', width: 40, height: 10 }));
    const src = 'sequenceDiagram\n  A->>B: averyveryverylongwordthatmustbreak $$x$$ more\n  B->>A: ok';
    const narrow = { ...options, maxWidth: 220 };
    expect(render(src, { ...narrow, math: tall.math }).height - render(src, { ...narrow, math: short.math }).height).toBeGreaterThanOrEqual(40);
  });
});
