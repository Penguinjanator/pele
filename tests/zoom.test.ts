import { describe, expect, it } from 'vitest';
import { frame } from '../src/zoom.js';

// A drawing 1200 by 300, shrunk to fit a box 400 wide.
const natural = { width: 1200, height: 300 };
const box = { width: 400, height: 100 };

describe('zoom frame', () => {
  it('shows the whole drawing at the scale that fits', () => {
    expect(frame(natural, box, 400 / 1200, 0, 0)).toEqual({ x: 0, y: 0, width: 1200, height: 300 });
  });

  it('shows less of the drawing, in the same proportions, as the scale grows', () => {
    for (const scale of [0.5, 1, 2, 3]) {
      const shown = frame(natural, box, scale, 0, 0);
      expect(shown.width, String(scale)).toBeCloseTo(400 / scale);
      expect(shown.height, String(scale)).toBeCloseTo(100 / scale);
      expect(shown.width / shown.height, String(scale)).toBeCloseTo(4);
    }
  });

  it('keeps the view inside the drawing', () => {
    const before = frame(natural, box, 1, -50, -50);
    expect([before.x, before.y]).toEqual([0, 0]);
    const past = frame(natural, box, 1, 5000, 5000);
    expect([past.x, past.y]).toEqual([1200 - 400, 300 - 100]);
    const inside = frame(natural, box, 2, 300, 120);
    expect([inside.x, inside.y]).toEqual([300, 120]);
  });

  it('keeps a drawing that is smaller than the view whole inside it', () => {
    // A panel larger than the drawing at this scale, as in a playground of a fixed height.
    const small = { width: 100, height: 50 };
    const panel = { width: 400, height: 300 };
    const shown = frame(small, panel, 2, 30, 10);
    expect([shown.width, shown.height]).toEqual([200, 150]);
    // It cannot be pushed out of view on either side.
    expect(shown.x).toBe(0);
    expect(shown.y).toBe(0);
    const pulled = frame(small, panel, 2, -500, -500);
    expect([pulled.x, pulled.y]).toEqual([100 - 200, 50 - 150]);
    // Where it rests inside the panel is kept: a point between the two ends is left alone.
    const resting = frame(small, panel, 2, -40, -60);
    expect([resting.x, resting.y]).toEqual([-40, -60]);
  });
});
