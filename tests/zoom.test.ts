import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enableZoom, frame } from '../src/zoom.js';

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

const drawingIn = (shown: number) => {
  const listening = new Map<string, number>();
  const handlers = new Map<string, (event: unknown) => void>();
  const attributes: Record<string, string> = { width: '1200', height: '300' };
  const svg = {
    localName: 'svg',
    style: {},
    getAttribute: (name: string) => attributes[name] ?? null,
    setAttribute: (name: string, value: string) => (attributes[name] = value),
    removeAttribute: (name: string) => delete attributes[name],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: shown, height: shown / 4 }),
    matches: (_selector: string): boolean => false,
  };
  const count = (type: string, by: number) => listening.set(type, (listening.get(type) ?? 0) + by);
  const element = {
    firstElementChild: svg,
    clientWidth: shown,
    clientHeight: shown / 4,
    style: {},
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      count(type, 1);
      handlers.set(type, handler);
    },
    removeEventListener: (type: string) => count(type, -1),
  };
  return {
    element: element as unknown as HTMLElement,
    svg,
    listening: (type: string) => listening.get(type) ?? 0,
    fire: (type: string, event: unknown) => handlers.get(type)?.(event),
    show: (width: number) => {
      shown = width;
      element.clientWidth = width;
      element.clientHeight = width / 4;
    },
  };
};

describe('zoom', () => {
  const globals = globalThis as Record<string, unknown>;
  beforeEach(() => {
    globals.getComputedStyle = () => ({ position: 'relative', getPropertyValue: () => '0px' });
  });
  afterEach(() => {
    delete globals.getComputedStyle;
  });

  it('takes the wheel only while the drawing can be enlarged', () => {
    const fits = drawingIn(1200);
    enableZoom(fits.element, { controls: false });
    expect(fits.listening('wheel')).toBe(0);
    expect(fits.listening('gesturestart')).toBe(0);
    expect(fits.listening('pointerdown')).toBe(1);

    const shrunk = drawingIn(400);
    const zoom = enableZoom(shrunk.element, { controls: false });
    expect(shrunk.listening('wheel')).toBe(1);
    expect(shrunk.listening('gesturestart')).toBe(1);
    shrunk.show(1200);
    zoom.refresh();
    expect(shrunk.listening('wheel')).toBe(0);
    shrunk.show(400);
    zoom.refresh();
    expect(shrunk.listening('wheel')).toBe(1);
    zoom.destroy();
    expect(shrunk.listening('wheel')).toBe(0);
    expect(shrunk.listening('pointerdown')).toBe(0);
  });

  it('rings a drawing focused from the keyboard, and keeps the ring where :focus-visible is not known', () => {
    const shrunk = drawingIn(400);
    enableZoom(shrunk.element, { controls: false });
    const style = shrunk.svg.style as { outline?: string };
    shrunk.fire('focusin', { target: shrunk.svg });
    expect(style.outline).toBe('none');
    shrunk.svg.matches = () => true;
    shrunk.fire('focusin', { target: shrunk.svg });
    expect(style.outline).toBe('');
    shrunk.svg.style = {};
    shrunk.svg.matches = () => {
      throw new SyntaxError("':focus-visible' is not a valid selector");
    };
    expect(() => shrunk.fire('focusin', { target: shrunk.svg })).not.toThrow();
    expect((shrunk.svg.style as { outline?: string }).outline).toBe('');
  });

  it('narrows a drawing at rest so that the buttons do not hide its text', () => {
    const bar = { left: 362, right: 392, top: 8, bottom: 64 };
    // Text coordinates use a 400-wide drawing; centered drawings model auto margins.
    const mounted = (text: { left: number; right: number; top: number; bottom: number }, centered = false) => {
      const style: Record<string, string> = centered ? { maxWidth: '350px' } : {};
      const box = () => {
        const width = Math.min(400, parseFloat(style.maxWidth) || 400);
        const right = parseFloat(style.marginRight);
        const left = !centered ? 0 : Number.isNaN(right) ? (400 - width) / 2 : 400 - right - width;
        return { left, right: left + width, top: 0, bottom: width / 4, width, height: width / 4 };
      };
      const shown = () => {
        const at = box();
        const k = at.width / 400;
        return { left: at.left + text.left * k, right: at.left + text.right * k, top: text.top * k, bottom: text.bottom * k };
      };
      const svg = {
        localName: 'svg',
        style,
        getAttribute: (name: string) => ({ width: '1200', height: '300' })[name] ?? null,
        setAttribute: () => {},
        removeAttribute: () => {},
        getBoundingClientRect: box,
        querySelectorAll: () => [{ getBoundingClientRect: shown }],
      };
      const node = () => ({ style: {}, setAttribute: () => {}, addEventListener: () => {}, append: () => {}, remove: () => {}, getBoundingClientRect: () => bar });
      const element = {
        firstElementChild: svg,
        clientLeft: 0,
        clientWidth: 400,
        clientHeight: 100,
        style: {},
        ownerDocument: { createElement: node },
        append: (child: { parentNode?: unknown }) => (child.parentNode = element),
        addEventListener: () => {},
        removeEventListener: () => {},
        getBoundingClientRect: () => ({ left: 0, right: 400, top: 0, bottom: 100 }),
      };
      return { style, box, zoom: enableZoom(element as unknown as HTMLElement) };
    };
    const label = { left: 330, right: 380, top: 30, bottom: 40 };
    const left = mounted(label);
    expect([left.style.maxWidth, left.style.marginRight]).toEqual(['358px', '42px']);
    left.zoom.zoomBy(2);
    expect(left.style.maxWidth).toBe('none');
    left.zoom.refresh();
    expect([left.style.width, left.style.maxWidth]).toEqual([undefined, '358px']);
    expect(mounted({ ...label, left: 300, right: 350 }).style.maxWidth).toBeUndefined();
    expect(mounted({ ...label, top: 70, bottom: 80 }).style.maxWidth).toBeUndefined();

    const centered = mounted({ ...label, left: 360, right: 395 }, true);
    expect(centered.box().right).toBe(358);
    expect(centered.box().left).toBe(25);
    centered.zoom.refresh();
    centered.zoom.refresh();
    expect(centered.box()).toMatchObject({ left: 25, right: 358 });
    centered.zoom.destroy();
    expect([centered.style.maxWidth, centered.style.marginRight]).toEqual(['350px', undefined]);
  });
});
