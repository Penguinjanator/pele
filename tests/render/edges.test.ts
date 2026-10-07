import { describe, expect, it } from 'vitest';
import { routePath } from '../../src/svg/edges.js';

// The numbers of the one curve in a path between two points: the two handles and where it ends.
// The path runs straight for a little way before and after it.
function curve(route: number[]): number[] {
  const { d } = routePath(route, undefined, 0, 0);
  expect(d).toMatch(/^M[-\d.,]+L[-\d.,]+C[-\d., ]+L[-\d.,]+$/);
  return d.slice(d.indexOf('C') + 1, d.lastIndexOf('L')).split(/[ ,]/).map(Number);
}

describe('edge paths', () => {
  it('runs straight for a fifth of the way at each end, and draws an even S between', () => {
    expect(routePath([0, 0, 0, 100, 48, 0], undefined, 0, 0).d).toBe('M0,0L0,9.6C0,24 100,24 100,38.4L100,48');
    expect(routePath([0, 0, 1, 48, -100, 1], undefined, 0, 0).d).toBe('M0,0L9.6,0C24,0 24,-100 38.4,-100L48,-100');
    // With room to spare, the straight part is no longer than it needs to be.
    expect(routePath([0, 0, 0, 100, 200, 0], undefined, 0, 0).d).toBe('M0,0L0,10C0,100 100,100 100,190L100,200');
  });

  it('turns sooner on a run much wider than the gap it crosses, and never sharper than a limit', () => {
    // 28.8 to turn in and 200 across: the handles reach half of the way, as in an even S.
    const [, even1, , even2] = curve([0, 0, 0, 200, 48, 0]);
    expect(even1).toBeCloseTo(24, 5);
    expect(even2).toBeCloseTo(24, 5);
    // 480 across is more than eight times as far, and 4800 no sharper than that.
    const [, y1, , y2] = curve([0, 0, 0, 480, 48, 0]);
    expect(y1).toBeCloseTo(16.8, 5);
    expect(y2).toBeCloseTo(31.2, 5);
    const [, far1, , far2] = curve([0, 0, 0, -4800, 48, 0]);
    expect(far1).toBeCloseTo(16.8, 5);
    expect(far2).toBeCloseTo(31.2, 5);
    const [x1, , x2] = curve([0, 0, 1, 40, 400, 1]);
    expect(x1).toBeCloseTo(14, 5);
    expect(x2).toBeCloseTo(26, 5);
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

  it('turns a curve as far from a node whatever marker its end carries', () => {
    // The arrowhead takes seven of the 9.6, and the curve turns where it would without one.
    expect(routePath([0, 0, 0, 100, 48, 0], undefined, 0, 7).d).toBe('M0,0L0,9.6C0,24 100,24 100,38.4L100,41');
    expect(routePath([0, 0, 0, 100, 48, 0], undefined, 8, 0).d).toBe('M0,8L0,9.6C0,24 100,24 100,38.4L100,48');
    // With too little room to run straight past a marker, the curve runs up to it.
    expect(routePath([0, 0, 0, 100, 19, 0], undefined, 0, 7).d).toBe('M0,0L0,3.8C0,6.49 100,9.31 100,12');
  });

  it('keeps both ends of an eased curve heading along the flow', () => {
    const path = routePath([0, 0, 0, 900, 48, 0], undefined, 0, 7);
    expect([path.sdx, path.sdy]).toEqual([-0, -1]);
    expect([path.edx, path.edy]).toEqual([0, 1]);
  });
});
