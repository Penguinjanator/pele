import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PeleError, mount, render, type RenderResult } from '../src/index.js';
import { metricsMeasurer } from '../src/text/measurer.js';

// Just enough of a browser for mount(): an element with a width, its computed style, and an observer to fire by hand.
interface FakeElement { clientWidth: number; innerHTML: string }
let observers: { fire: () => void; element: FakeElement; connected: boolean }[] = [];
const globals = globalThis as Record<string, unknown>;

beforeEach(() => {
  observers = [];
  globals.getComputedStyle = () => ({ fontFamily: 'sans-serif', paddingLeft: '10px', paddingRight: '10px' });
  globals.ResizeObserver = class {
    private entry = { fire: () => this.callback(), element: undefined as unknown as FakeElement, connected: false };
    constructor(private callback: () => void) {}
    observe(element: FakeElement) {
      this.entry.element = element;
      this.entry.connected = true;
      observers.push(this.entry);
    }
    disconnect() {
      this.entry.connected = false;
    }
  };
});
afterEach(() => {
  delete globals.getComputedStyle;
  delete globals.ResizeObserver;
});

const element = (clientWidth: number): HTMLElement => ({ clientWidth, innerHTML: '' }) as unknown as HTMLElement;
const resize = (target: HTMLElement, clientWidth: number): void => {
  (target as unknown as FakeElement).clientWidth = clientWidth;
  for (const observer of observers) if (observer.connected && observer.element === (target as unknown)) observer.fire();
};
const options = { measurer: metricsMeasurer };
const SANKEY = 'sankey\n\nGrid,Homes,113\nGrid,Industry,342\nGrid,Losses,56\n';
const FLOW = 'flowchart LR\n  A[One] --> B[Two] --> C[Three] --> D[Four] --> E[Five] --> F[Six] --> G[Seven]';

describe('mount', () => {
  it('draws a chart for the room the element has, and again when that changes', () => {
    const natural = render(SANKEY, options);
    const el = element(1000);
    const drawn: RenderResult[] = [];
    const handle = mount(el, SANKEY, { ...options, onRender: (result) => drawn.push(result) });
    expect(el.innerHTML).toBe(natural.svg);
    expect(handle.result.width).toBe(natural.width);

    resize(el, 420);
    expect(handle.result.width).toBe(400);
    expect(el.innerHTML).toBe(render(SANKEY, { ...options, maxWidth: 400 }).svg);

    resize(el, 340);
    expect(handle.result.width).toBe(320);
    resize(el, 1000);
    expect(el.innerHTML).toBe(natural.svg);
    expect(drawn.map((result) => result.width)).toEqual([natural.width, 400, 320, natural.width]);
  });

  it('starts narrow in a narrow element', () => {
    const el = element(340);
    expect(mount(el, SANKEY, options).result.width).toBe(320);
  });

  it('draws once when the diagram cannot use the room differently', () => {
    const el = element(1000);
    let count = 0;
    const handle = mount(el, FLOW.replace('LR', 'TB'), { ...options, onRender: () => count++ });
    const natural = el.innerHTML;
    resize(el, 300);
    resize(el, 30);
    resize(el, 900);
    expect(count).toBe(1);
    expect(el.innerHTML).toBe(natural);
    expect(handle.result.type).toBe('flowchart');
  });

  it('turns a flowchart that runs across when the element gets narrow, and back', () => {
    const el = element(1000);
    const handle = mount(el, FLOW, options);
    const across = handle.result;
    resize(el, 700);
    expect(handle.result.height).toBeLessThanOrEqual(across.height);
    resize(el, 340);
    expect(handle.result.height).toBeGreaterThan(across.height);
    expect(handle.result.width).toBeLessThan(across.width);
    resize(el, 1000);
    expect(handle.result.svg).toBe(across.svg);
  });

  it('does not chase an element that takes the width of its drawing', () => {
    const el = element(340);
    let count = 0;
    const handle = mount(el, SANKEY, { ...options, onRender: () => count++ });
    resize(el, handle.result.width + 20);
    resize(el, handle.result.width + 20);
    expect(count).toBe(1);
  });

  it('waits for an element that has no width yet', () => {
    const el = element(0);
    const handle = mount(el, SANKEY, options);
    expect(handle.result.width).toBe(render(SANKEY, options).width);
    resize(el, 340);
    expect(handle.result.width).toBe(320);
  });

  it('measures with the font of the element unless one is given', () => {
    const seen: string[] = [];
    globals.getComputedStyle = () => ({ fontFamily: 'Inter', paddingLeft: '0px', paddingRight: '0px' });
    const spy = (text: string, o: { fontFamily?: string }) => {
      seen.push(o.fontFamily ?? '');
      return render(text, { ...o, measurer: metricsMeasurer });
    };
    return import('../src/mount.js').then(({ mountWith }) => {
      mountWith(spy, element(500), FLOW);
      mountWith(spy, element(500), FLOW, { fontFamily: 'Georgia' });
      // Each mount draws twice here: once to learn the natural size, once for the room.
      expect([...new Set(seen)]).toEqual(['Inter', 'Georgia']);
    });
  });

  it('keeps to a width the host sets', () => {
    const el = element(1000);
    const handle = mount(el, SANKEY, { ...options, maxWidth: 320 });
    expect(handle.result.width).toBe(320);
    resize(el, 600);
    expect(handle.result.width).toBe(320);
  });

  it('updates, reports errors as render does, and stops when destroyed', () => {
    const el = element(340);
    const handle = mount(el, SANKEY, options);
    expect(handle.update(FLOW).type).toBe('flowchart');
    expect(el.innerHTML).toBe(render(FLOW, { ...options, maxWidth: 320 }).svg);
    expect(() => handle.update('flowchart LR\n  A -->')).toThrow(PeleError);
    expect(el.innerHTML).toBe(render(FLOW, { ...options, maxWidth: 320 }).svg);
    expect(() => mount(element(300), 'not a diagram', options)).toThrow(PeleError);

    handle.update(SANKEY);
    handle.destroy();
    const before = el.innerHTML;
    resize(el, 1000);
    expect(el.innerHTML).toBe(before);
  });

  it('works where there is nothing to watch with', () => {
    delete globals.ResizeObserver;
    const el = element(340);
    const handle = mount(el, SANKEY, options);
    expect(handle.result.width).toBe(320);
    handle.destroy();
  });
});
