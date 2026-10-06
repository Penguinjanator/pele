import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from '../../src/index.js';
import { metricsMeasurer } from '../../src/text/measurer.js';
import { assertInert } from '../support/inert.js';

const options = { measurer: metricsMeasurer };
const corpora = readdirSync('tests/corpus')
  .filter((file) => file.endsWith('-docs.json'))
  .sort()
  .map((file) => ({ name: file.replace('-docs.json', ''), sources: JSON.parse(readFileSync(`tests/corpus/${file}`, 'utf8')) as string[] }));
const examples = (name: string): string[] => corpora.find((corpus) => corpus.name === name)!.sources;

const PHONE = 320;

describe('the maxWidth option', () => {
  it('never makes a diagram wider, and leaves one that fits as it was', { timeout: 120000 }, () => {
    for (const { name, sources } of corpora) {
      for (const source of sources) {
        const natural = render(source, options);
        const narrow = render(source, { ...options, maxWidth: PHONE });
        expect(narrow.width, name).toBeLessThanOrEqual(natural.width);
        assertInert(narrow.svg, name);
        expect(render(source, { ...options, maxWidth: natural.width }).svg, name).toBe(natural.svg);
      }
    }
  });

  it('draws charts at the width there is, with text at its own size', () => {
    for (const name of ['xychart', 'radar', 'pie']) {
      for (const source of examples(name)) {
        const natural = render(source, options);
        const narrow = render(source, { ...options, maxWidth: PHONE });
        expect(natural.width, name).toBeGreaterThan(PHONE);
        expect(narrow.width, name).toBeLessThanOrEqual(PHONE);
        expect(narrow.svg.match(/^<svg[^>]* font-size="(\d+)"/)?.[1], name).toBe(natural.svg.match(/^<svg[^>]* font-size="(\d+)"/)?.[1]);
      }
    }
  });

  it('draws these types narrower than they are by default', () => {
    for (const name of ['sankey', 'treemap', 'gantt', 'wardley', 'quadrant']) {
      const narrower = examples(name).filter((source) => render(source, { ...options, maxWidth: PHONE }).width < render(source, options).width);
      expect(narrower.length, name).toBeGreaterThan(examples(name).length / 2);
    }
  });

  it('puts a legend below a chart that has no room beside it', () => {
    const pie = 'pie title Pets\n  "Dogs" : 386\n  "Cats" : 85\n  "Rats" : 15';
    const wide = render(pie, options);
    const narrow = render(pie, { ...options, maxWidth: PHONE });
    expect(narrow.width).toBeLessThan(wide.width);
    expect(narrow.height).toBeGreaterThan(wide.height);
    // A legend the author placed is left where it is.
    const placed = `---\nconfig:\n  pie:\n    legendPosition: bottom\n---\n${pie}`;
    expect(render(placed, { ...options, maxWidth: PHONE }).svg).toBe(render(placed, options).svg);
  });

  it('runs a timeline or a git graph downward when it does not fit across', () => {
    const timeline = 'timeline\n  title History\n  section One\n    2001 : First thing\n    2002 : Second thing\n    2003 : Third thing\n  section Two\n    2004 : Fourth thing\n    2005 : Fifth thing';
    const across = render(timeline, options);
    const down = render(timeline, { ...options, maxWidth: PHONE });
    expect(across.width).toBeGreaterThan(PHONE);
    expect(down.width).toBeLessThanOrEqual(PHONE);
    expect(down.height).toBeGreaterThan(across.height);
    // The same drawing as a timeline written to run down, at that width.
    expect(down.svg).toBe(render(timeline.replace('timeline', 'timeline TD'), { ...options, maxWidth: PHONE }).svg);
    expect(render(timeline, { ...options, maxWidth: across.width }).svg).toBe(across.svg);

    const git = 'gitGraph\n  commit\n  commit\n  branch develop\n  commit\n  commit\n  checkout main\n  merge develop\n  commit\n  commit\n  commit';
    const wide = render(git, options);
    expect(wide.width).toBeGreaterThan(PHONE);
    expect(render(git, { ...options, maxWidth: PHONE }).svg).toBe(render(git.replace('gitGraph', 'gitGraph TB:'), options).svg);
    // A direction the author chose is kept.
    const upward = git.replace('gitGraph', 'gitGraph BT:');
    expect(render(upward, { ...options, maxWidth: 100 }).svg).toBe(render(upward, options).svg);
  });

  it('folds a kanban board into rows of columns', () => {
    const board = 'kanban\n' + ['Todo', 'Doing', 'Review', 'Done'].map((name, i) => `  c${i}[${name}]\n    t${i}[Task ${i}]`).join('\n');
    const wide = render(board, options);
    const tops = (svg: string): number[] => [...svg.matchAll(/class="pele-cluster pele-column" data-id="[^"]*" transform="translate\([\d.]+,([\d.]+)\)"/g)].map((m) => Number(m[1]));
    expect(new Set(tops(wide.svg)).size).toBe(1);
    const phone = render(board, { ...options, maxWidth: PHONE });
    expect(phone.width).toBeLessThanOrEqual(PHONE);
    expect(new Set(tops(phone.svg)).size).toBe(4);
    const tablet = render(board, { ...options, maxWidth: 480 });
    expect(tablet.width).toBeLessThanOrEqual(480);
    expect(new Set(tops(tablet.svg)).size).toBe(2);
  });

  it('ignores a width that is not a positive number, and survives a tiny one', { timeout: 120000 }, () => {
    for (const { name, sources } of corpora) {
      const source = sources[0];
      const natural = render(source, options).svg;
      for (const maxWidth of [0, -5, NaN, Infinity]) expect(render(source, { ...options, maxWidth }).svg, `${name}: ${maxWidth}`).toBe(natural);
      const tiny = render(source, { ...options, maxWidth: 1 });
      expect(Number.isFinite(tiny.width) && tiny.width > 0, name).toBe(true);
      assertInert(tiny.svg, name);
    }
  });
});
