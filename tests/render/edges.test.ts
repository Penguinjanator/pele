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

  it('keeps both ends of an eased curve heading along the flow', () => {
    const path = routePath([0, 0, 0, 900, 48, 0], undefined, 0, 7);
    expect([path.sdx, path.sdy]).toEqual([-0, -1]);
    expect([path.edx, path.edy]).toEqual([0, 1]);
  });
});
