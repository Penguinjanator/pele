import { describe, expect, it } from 'vitest';
import { parse, render, supports } from '../../src/index.js';
import { metricsMeasurer } from '../../src/text/measurer.js';
import { elements } from '../support/xml.js';

const options = { measurer: metricsMeasurer };

const BASIC = 'radar-beta\n  axis A, B, C, D\n  curve one["First"]{1,2,3,4}\n  curve two{4,3,2,1}';

function config(radar: string, body: string): string {
  return `---\nconfig:\n  radar:\n${radar}\n---\n${body}`;
}

function count(svg: string, name: string, within: string): number {
  const from = svg.indexOf(`class="${within}"`);
  if (from === -1) return 0;
  const group = svg.slice(from, svg.indexOf('</g>', from));
  return elements(group).filter((el) => el.name === name).length;
}

describe('radar rendering', () => {
  it('draws axes, labels, a graticule, curves and a legend', () => {
    const { svg, type } = render(BASIC, options);
    expect(type).toBe('radar');
    expect(supports('radar-beta\naxis A')).toBe(true);
    expect(count(svg, 'circle', 'pele-graticule')).toBe(5);
    expect(svg.match(/class="pele-axis-label"/g)?.length).toBe(4);
    expect(svg.match(/<path class="pele-curve"/g)?.length).toBe(2);
    expect(svg.match(/class="pele-legend-item"/g)?.length).toBe(2);
    expect(svg).toContain('>First<');
    expect(svg).toContain('>two<');
    expect(svg).toContain('data-id="one" fill="var(--pele-series-1,');
    expect(svg).toContain('data-id="two" fill="var(--pele-series-2,');
    expect(svg).toContain('fill-opacity="0.2"');
    expect(svg.match(/class="pele-axes" d="([^"]*)"/)![1].match(/M0,0L/g)?.length).toBe(4);
  });

  it('draws polygons for a polygon graticule, with the given number of ticks', () => {
    const { svg } = render(BASIC + '\n  graticule polygon\n  ticks 3', options);
    expect(count(svg, 'polygon', 'pele-graticule')).toBe(3);
    expect(count(svg, 'circle', 'pele-graticule')).toBe(0);
    expect(svg.match(/<polygon class="pele-curve"/g)?.length).toBe(2);
    expect(svg).not.toContain('<path class="pele-curve"');
  });

  it('hides the legend with showLegend false', () => {
    const shown = render(BASIC, options);
    const hidden = render(BASIC + '\n  showLegend false', options);
    expect(hidden.svg).not.toContain('pele-legend');
    expect(hidden.width).toBeLessThan(shown.width);
  });

  it('scales values between min and max', () => {
    const top = (src: string): number => {
      const { svg } = render(src + '\n graticule polygon', options);
      return Number(svg.match(/<polygon class="pele-curve"[^>]* points="0,(-?[\d.]+) /)![1]);
    };
    const body = 'radar-beta\n axis A, B, C\n curve c{50, 0, 0}';
    expect(top(body)).toBe(-160);
    expect(top(body + '\n max 100')).toBe(-80);
    expect(top(body + '\n max 100\n min 20')).toBe(-60);
    // Values outside the range are clipped to it.
    expect(top(body + '\n max 25')).toBe(-160);
    expect(top(body + '\n min 60\n max 100')).toBe(0);
  });

  it('honours width, height, margins and the axis factors', () => {
    const base = render(BASIC + '\n showLegend false', options);
    const large = render(config('    width: 600\n    height: 600', BASIC + '\n showLegend false'), options);
    // The labels move out with the radius, so the picture grows by a little more than the chart.
    expect(large.width - base.width).toBeGreaterThanOrEqual(280);
    expect(large.width - base.width).toBeLessThan(300);
    expect(large.height - base.height).toBeGreaterThanOrEqual(280);
    const roomy = render(config('    marginTop: 100\n    marginLeft: 120', BASIC + '\n showLegend false'), options);
    expect(roomy.height).toBeGreaterThan(base.height);
    expect(roomy.width).toBeGreaterThan(base.width);
    const short = render(config('    axisScaleFactor: 0.5', BASIC), options).svg;
    expect(short).toContain('M0,0L0,-80');
    expect(render(BASIC, options).svg).toContain('M0,0L0,-160');
    const far = render(config('    axisLabelFactor: 1.5', BASIC), options);
    expect(far.height).toBeGreaterThan(base.height);
  });

  it('rounds curves by curveTension', () => {
    const straight = render(config('    curveTension: 0', BASIC), options).svg;
    const round = render(config('    curveTension: 0.5', BASIC), options).svg;
    expect(straight).not.toBe(round);
    // With no tension every control point sits on an end point.
    const d = straight.match(/data-id="one"[^>]* d="([^"]*)"/)![1];
    expect(d.startsWith('M0,-40 C0,-40 80,0 80,0 ')).toBe(true);
  });

  it('leaves out a curve without a value for every axis, but keeps it in the legend', () => {
    const { svg } = render('radar-beta\n axis A, B, C\n curve full{1,2,3}\n curve short{1,2}', options);
    expect(svg.match(/class="pele-curve"/g)?.length).toBe(1);
    expect(svg.match(/class="pele-legend-item"/g)?.length).toBe(2);
  });

  it('orders named entries by axis, and rejects a missing one', () => {
    const model = parse('radar-beta\n axis A, B, C\n curve c{ C: 3, A: 1, B: 2 }');
    if (model.type === 'radar') expect(model.curves[0].entries).toEqual([1, 2, 3]);
    expect(() => render('radar-beta\n axis A["Alpha"], B\n curve c{ B: 2 }', options)).toThrow('Missing entry for axis Alpha');
    expect(() => render('radar-beta\n curve c{ B: 2 }', options)).toThrow(
      'Axes must be populated before curves for reference entries'
    );
  });

  it('uses the last value of a repeated option and caps ticks at 32', () => {
    const model = parse('radar-beta\n ticks 3\n ticks 100\n max 5\n max 7\n graticule polygon\n showLegend false');
    expect(model.type).toBe('radar');
    if (model.type === 'radar') {
      expect(model.options).toEqual({ showLegend: false, ticks: 32, max: 7, min: 0, graticule: 'polygon' });
    }
  });

  it('draws the title above, from the diagram or the front matter', () => {
    expect(render('---\ntitle: From front matter\n---\n' + BASIC, options).svg).toContain('>From front matter<');
    const own = render('---\ntitle: From front matter\n---\n' + BASIC + '\n title Own', options).svg;
    expect(own).toContain('>Own<');
    expect(own).not.toContain('From front matter');
  });

  it('keeps every label inside the picture', () => {
    const { svg, width, height } = render(
      'radar-beta\n axis a["Top"], b["A very long label on the right side"], c["Bottom"], d["A very long label on the left side"]\n curve c{1,2,3,4}',
      options
    );
    expect(svg).toContain(`viewBox="0 0 ${width} ${height}"`);
    expect(width).toBeGreaterThan(320 + 2 * 200);
  });

  it('copes with no axes, no curves, one axis, and degenerate ranges', () => {
    for (const src of [
      'radar-beta',
      'radar-beta\n axis A, B, C',
      'radar-beta\n axis A\n curve c{5}',
      'radar-beta\n curve c{1,2,3}',
      'radar-beta\n axis A, B\n curve c{1,1}\n min 1\n max 1',
      'radar-beta\n axis A, B\n curve c{1,2}\n min 9\n max 2',
      'radar-beta\n axis A, B\n curve c{0,0}',
      'radar-beta\n axis A, B\n curve c{1,2}\n ticks 0',
      'radar-beta\n axis A, B\n curve c{1,2}\n ticks 0.3\n graticule polygon',
      'radar-beta\n axis A, B\n curve c{1,2}\n max ' + '9'.repeat(400),
      'radar-beta\n axis A, B\n curve c{' + '9'.repeat(400) + ',2}',
      config('    width: -5\n    height: "tall"\n    curveTension: 99\n    marginTop: -1', BASIC),
    ]) {
      const { svg } = render(src, options);
      expect(svg, src).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it('writes accessible names', () => {
    const { svg } = render(BASIC + '\n accTitle: Name\n accDescr: Text', options);
    expect(svg).toContain('<title id="pele-title">Name</title>');
    expect(svg).toContain('<desc id="pele-desc">Text</desc>');
  });
});
