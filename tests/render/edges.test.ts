import { describe, expect, it } from 'vitest';
import { routePath } from '../../src/svg/edges.js';

// The numbers of the one curve in a path that runs between two points.
function curve(route: number[]): number[] {
  const { d } = routePath(route, undefined, 0, 0);
  expect(d).toMatch(/^M[-\d.,]+C[-\d., ]+$/);
  return d.slice(d.indexOf('C') + 1).split(/[ ,]/).map(Number);
}

describe('edge paths', () => {
  it('draws an even S between points that are not far apart across the flow', () => {
    expect(curve([0, 0, 0, 100, 48, 0])).toEqual([0, 24, 100, 24, 100, 48]);
    expect(curve([0, 0, 1, 48, -100, 1])).toEqual([24, 0, 24, -100, 48, -100]);
  });

  it('turns sooner on a run much wider than the gap it crosses, and never sharper than a limit', () => {
    const [, y1, , y2] = curve([0, 0, 0, 480, 48, 0]);
    expect(y1).toBeCloseTo(9.6, 5);
    expect(y2).toBeCloseTo(38.4, 5);
    const [, far1, , far2] = curve([0, 0, 0, -4800, 48, 0]);
    expect(far1).toBeCloseTo(5.76, 5);
    expect(far2).toBeCloseTo(42.24, 5);
    const [x1, , x2] = curve([0, 0, 1, 40, 400, 1]);
    expect(x1).toBeCloseTo(8, 5);
    expect(x2).toBeCloseTo(32, 5);
  });

  it('rounds the corner where two straight runs meet, by up to half of a run with a corner at each end', () => {
    expect(routePath([0, 0, 0, 0, 20, 0, 100, 20, 0, 100, 48, 0], undefined, 0, 0).d).toBe('M0,0L0,8Q0,20 12,20L88,20Q100,20 100,32L100,48');
    // The run in the middle is 10 long, so each of its corners takes 5.
    expect(routePath([0, 0, 0, 0, 20, 0, 10, 20, 0, 10, 48, 0], undefined, 0, 0).d).toBe('M0,0L0,15Q0,20 5,20L5,20Q10,20 10,25L10,48');
    expect(routePath([0, 0, 0, 0, 20, 0, 100, 20, 0, 100, 48, 0], 'linear', 0, 0).d).toBe('M0,0L0,20L100,20L100,48');
    // Two runs in one line have no corner between them.
    expect(routePath([0, 0, 0, 0, 20, 0, 0, 48, 0], undefined, 0, 0).d).toBe('M0,0L0,20L0,48');
  });

  it('turns a stepped route at right angles, with arrowheads along its last run', () => {
    const step = routePath([0, 0, 0, 100, 48, 0], 'step', 0, 7);
    expect(step.d).toBe('M0,0L0,12Q0,24 12,24L88,24Q100,24 100,36L100,41');
    expect([step.edx, step.edy]).toEqual([0, 1]);
    expect(routePath([0, 0, 0, 100, 48, 0], 'stepAfter', 0, 0).d).toBe('M0,0L0,36Q0,48 12,48L100,48');
    expect(routePath([0, 0, 1, 48, 100, 1], 'stepBefore', 0, 0).d).toBe('M0,0L0,88Q0,100 12,100L48,100');
  });

  it('runs a curve straight for a little way into the marker at its end', () => {
    // Seven for the arrowhead, then six straight, and the curve turns in what is left.
    expect(routePath([0, 0, 0, 100, 48, 0], undefined, 0, 7).d).toBe('M0,0C0,17.5 100,17.5 100,35L100,41');
    // Without a marker the curve runs all the way.
    expect(routePath([0, 0, 0, 100, 48, 0], undefined, 0, 0).d).toBe('M0,0C0,24 100,24 100,48');
    // With little room, the straight part takes a quarter of it at most.
    expect(routePath([0, 0, 0, 100, 19, 0], undefined, 0, 7).d).toBe('M0,0C0,1.62 100,7.38 100,9L100,12');
  });

  it('keeps both ends of an eased curve heading along the flow', () => {
    const path = routePath([0, 0, 0, 900, 48, 0], undefined, 0, 7);
    expect([path.sdx, path.sdy]).toEqual([-0, -1]);
    expect([path.edx, path.edy]).toEqual([0, 1]);
  });
});
