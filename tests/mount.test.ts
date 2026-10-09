import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PeleError, mount, parse, render, type DiagramModel, type RenderOptions, type RenderResult } from '../src/index.js';
import { mountWith, type Engine } from '../src/mount.js';
import { metricsMeasurer } from '../src/text/measurer.js';

setFlagsFromString('--expose-gc');
const collect = runInNewContext('gc') as () => void;

// Just enough of a browser for mount(): an element with a width, its computed style, and an observer to fire by hand.
interface FakeElement { clientWidth: number; innerHTML: string }
let observers: { fire: () => void; element: FakeElement; connected: boolean }[] = [];
const globals = globalThis as Record<string, unknown>;

beforeEach(() => {
  observers = [];
  globals.getComputedStyle = () => ({ fontFamily: 'sans-serif', paddingLeft: '10px', paddingRight: '10px', getPropertyValue: () => '' });
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

const element = (clientWidth: number): HTMLElement =>
  ({ clientWidth, innerHTML: '', firstElementChild: null, addEventListener() {}, removeEventListener() {} }) as unknown as HTMLElement;
const resize = (target: HTMLElement, clientWidth: number): void => {
  (target as unknown as FakeElement).clientWidth = clientWidth;
  for (const observer of observers) if (observer.connected && observer.element === (target as unknown)) observer.fire();
};
const options = { measurer: metricsMeasurer };
// The library's own functions, with every render reported.
const spying = (seen: (o: RenderOptions) => void, parsed?: () => void): Engine => ({
  parse(text, o) {
    parsed?.();
    return parse(text, o);
  },
  render(model: DiagramModel, o) {
    seen(o);
    return render(model, { ...o, measurer: metricsMeasurer });
  },
});
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

  it('leaves the drawing alone while the element has no width, as when it is hidden', () => {
    const el = element(420);
    let count = 0;
    const handle = mount(el, SANKEY, { ...options, onRender: () => count++ });
    resize(el, 0);
    expect(handle.result.width).toBe(400);
    resize(el, 420);
    expect(count).toBe(1);
    resize(el, 340);
    expect(handle.result.width).toBe(320);
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
    globals.getComputedStyle = () => ({ fontFamily: 'Inter', paddingLeft: '0px', paddingRight: '0px', getPropertyValue: () => '' });
    const spy = spying((o) => seen.push(o.fontFamily ?? ''));
    mountWith(spy, element(500), FLOW);
    mountWith(spy, element(500), FLOW, { fontFamily: 'Georgia' });
    // Each mount draws twice here: once to learn the natural size, once for the room.
    expect([...new Set(seen)]).toEqual(['Inter', 'Georgia']);
  });

  // An element whose drawing, once it has one, can be given variables of its own.
  interface Styled { fontFamily: string; vars?: Record<string, string> }
  const styled = (container: Styled, drawing?: Styled) => {
    const child = {};
    const listeners = new Set<(event: unknown) => void>();
    const el = {
      clientWidth: 500,
      html: '',
      firstElementChild: null as object | null,
      get innerHTML() {
        return this.html;
      },
      set innerHTML(value: string) {
        this.html = value;
        this.firstElementChild = drawing ? child : null;
      },
      addEventListener() {},
      removeEventListener() {},
      ownerDocument: {
        fonts: {
          addEventListener: (_: string, listener: (event: unknown) => void) => listeners.add(listener),
          removeEventListener: (_: string, listener: (event: unknown) => void) => listeners.delete(listener),
        },
      },
    };
    globals.getComputedStyle = (target: unknown) => {
      const style = target === child && drawing ? drawing : container;
      return { fontFamily: style.fontFamily, paddingLeft: '0px', paddingRight: '0px', getPropertyValue: (name: string) => style.vars?.[name] ?? '' };
    };
    const seen: string[] = [];
    const spy = spying((o) => seen.push(`${o.fontFamily}|${o.fontFamilyMono}`));
    const loaded = () => {
      const event = {};
      for (const listener of [...listeners]) listener(event);
    };
    return { el: el as unknown as HTMLElement, seen, spy, loaded, listeners };
  };

  it('takes its fonts from the variables where they are set', () => {
    const { el, seen, spy } = styled({ fontFamily: 'Georgia', vars: { '--pele-font': ' Inter, sans-serif ', '--pele-font-mono': 'Menlo' } });
    mountWith(spy, el, FLOW);
    expect([...new Set(seen)]).toEqual(['Inter, sans-serif|Menlo']);
    expect(el.innerHTML).toContain('font-family:var(--pele-font,Inter, sans-serif)');
    expect(el.innerHTML).toContain('--_fm:var(--pele-font-mono,Menlo)');
  });

  it('finds a variable that is set on the drawing and not on the element', () => {
    const { el, seen, spy } = styled({ fontFamily: 'Georgia' }, { fontFamily: 'Inter', vars: { '--pele-font': 'Inter' } });
    let renders = 0;
    const handle = mountWith(spy, el, FLOW, { onRender: () => renders++ });
    // Drawn for the element's font first, as nothing better is known, then for the one found.
    expect([...new Set(seen)]).toEqual(['Georgia|undefined', 'Inter|undefined']);
    expect(el.innerHTML).toContain('font-family:var(--pele-font,Inter)');
    expect(renders).toBe(1);
    seen.length = 0;
    handle.update(FLOW);
    expect([...new Set(seen)]).toEqual(['Inter|undefined']);
  });

  it('measures again when a font has loaded, and leaves the element alone if nothing moved', () => {
    const { el, seen, spy, loaded } = styled({ fontFamily: 'Georgia' });
    let renders = 0;
    const handle = mountWith(spy, el, FLOW, { onRender: () => renders++ });
    const drawn = seen.length;
    loaded();
    expect(seen.length).toBeGreaterThan(drawn);
    expect(renders).toBe(1);
    handle.destroy();
    const after = seen.length;
    loaded();
    expect(seen.length).toBe(after);
  });

  it('draws again with the page\'s fonts once an element mounted outside the document is in it', () => {
    const { el, seen, spy } = styled({ fontFamily: '' });
    const outside = el as unknown as { isConnected: boolean; clientWidth: number };
    outside.isConnected = false;
    outside.clientWidth = 0;
    let renders = 0;
    mountWith(spy, el, FLOW, { onRender: () => renders++ });
    expect([...new Set(seen)]).toEqual(['undefined|undefined']);
    // Put in the document: it has a font and a width now, and the observer reports its size.
    globals.getComputedStyle = () => ({ fontFamily: 'Georgia', paddingLeft: '0px', paddingRight: '0px', getPropertyValue: () => '' });
    outside.isConnected = true;
    outside.clientWidth = 500;
    seen.length = 0;
    resize(el, 500);
    expect([...new Set(seen)]).toEqual(['Georgia|undefined']);
    expect(el.innerHTML).toContain('font-family:var(--pele-font,Georgia)');
    expect(renders).toBe(2);
  });

  it('makes a zoom for the diagram unless told not to', () => {
    expect(mount(element(500), FLOW, options).zoom).toBeDefined();
    expect(mount(element(500), FLOW, { ...options, zoom: true }).zoom).toBeDefined();
    expect(mount(element(500), FLOW, { ...options, zoom: { controls: false, labels: { zoomIn: 'Agrandir' } } }).zoom).toBeDefined();
    const handle = mount(element(500), FLOW, { ...options, zoom: false });
    expect(handle.zoom).toBeUndefined();
    handle.update(FLOW, options);
    expect(handle.zoom).toBeDefined();
    // Nothing has been shrunk here, so there is nothing to enlarge.
    expect(handle.zoom!.fit).toBe(1);
    expect(handle.zoom!.scale).toBe(1);
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

  // A document whose fonts keep their listeners, as a browser's do, and elements to mount in it.
  const page = () => {
    const listeners = new Set<(event: unknown) => void>();
    const ownerDocument = {
      fonts: {
        addEventListener: (_: string, listener: (event: unknown) => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: (event: unknown) => void) => listeners.delete(listener),
      },
    };
    const make = (clientWidth: number) =>
      ({ clientWidth, innerHTML: '', firstElementChild: null, isConnected: true, ownerDocument, addEventListener() {}, removeEventListener() {} }) as unknown as HTMLElement;
    const loaded = () => {
      for (const listener of [...listeners]) listener({});
    };
    return { element: make, loaded, listeners };
  };
  const connect = (target: HTMLElement, connected: boolean): void => {
    (target as unknown as { isConnected: boolean }).isConnected = connected;
  };

  it('listens to a document\'s fonts once, however many diagrams are in it', () => {
    const doc = page();
    let draws = 0;
    const spy = spying(() => draws++);
    const handles = [1, 2, 3].map(() => mountWith(spy, doc.element(500), FLOW));
    expect(doc.listeners.size).toBe(1);
    draws = 0;
    doc.loaded();
    const all = draws;
    expect(all).toBeGreaterThan(0);
    handles[0].destroy();
    draws = 0;
    doc.loaded();
    expect(draws).toBe((all / 3) * 2);
  });

  it('does not keep an element that the page has dropped', async () => {
    // The observer of these tests keeps what it observes. A browser's does not.
    delete globals.ResizeObserver;
    const doc = page();
    const dropped: WeakRef<HTMLElement>[] = [];
    const kept = doc.element(500);
    let draws = 0;
    mountWith(spying(() => draws++), kept, FLOW);
    (() => {
      for (let i = 0; i < 20; i++) {
        const el = doc.element(500);
        mount(el, FLOW, options);
        dropped.push(new WeakRef(el));
      }
    })();
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      collect();
    }
    expect(dropped.filter((ref) => ref.deref() !== undefined).length).toBe(0);
    // The one the page still has is still drawn again when a font loads.
    draws = 0;
    doc.loaded();
    expect(draws).toBeGreaterThan(0);
  });

  it('leaves a diagram that is out of the document alone when a font loads, and draws it when it is back', () => {
    const doc = page();
    const el = doc.element(500);
    let draws = 0;
    mountWith(spying(() => draws++), el, FLOW);
    connect(el, false);
    draws = 0;
    doc.loaded();
    expect(draws).toBe(0);
    connect(el, true);
    resize(el, 500);
    expect(draws).toBeGreaterThan(0);
  });

  it('draws text that was given while out of the document again when it is back, with the fonts there', () => {
    const { el, seen, spy } = styled({ fontFamily: 'Georgia' });
    const handle = mountWith(spy, el, FLOW);
    connect(el, false);
    globals.getComputedStyle = () => ({ fontFamily: '', paddingLeft: '0px', paddingRight: '0px', getPropertyValue: () => '' });
    seen.length = 0;
    handle.update(FLOW.replace('Seven', 'Eight'));
    expect([...new Set(seen)]).toEqual(['undefined|undefined']);
    globals.getComputedStyle = () => ({ fontFamily: 'Georgia', paddingLeft: '0px', paddingRight: '0px', getPropertyValue: () => '' });
    connect(el, true);
    seen.length = 0;
    resize(el, 500);
    expect([...new Set(seen)]).toEqual(['Georgia|undefined']);
    expect(el.innerHTML).toContain('Eight');
  });

  it('keeps the text it had when other text cannot be drawn', () => {
    const el = element(1000);
    const handle = mount(el, SANKEY, options);
    expect(() => handle.update('flowchart LR\n  A -->')).toThrow(PeleError);
    // What is shown is still fitted to the room there is.
    resize(el, 340);
    expect(handle.result.width).toBe(320);
    expect(el.innerHTML).toBe(render(SANKEY, { ...options, maxWidth: 320 }).svg);
  });

  it('parses the text once, however often it is drawn', () => {
    let parses = 0;
    let draws = 0;
    const el = element(1000);
    const handle = mountWith(spying(() => draws++, () => parses++), el, SANKEY);
    resize(el, 420);
    resize(el, 340);
    handle.refresh();
    handle.update(SANKEY);
    expect(draws).toBeGreaterThan(4);
    expect(parses).toBe(1);
    handle.update(SANKEY, { maxEdges: 10 });
    handle.update(FLOW);
    expect(parses).toBe(3);
  });

  it('observes nothing when told not to watch, and is fitted and refreshed by its host', () => {
    const doc = page();
    const el = doc.element(1000);
    const seen: string[] = [];
    const handle = mountWith(spying((o) => seen.push(o.fontFamily ?? '')), el, SANKEY, { watch: false });
    expect(observers.length).toBe(0);
    expect(doc.listeners.size).toBe(0);
    const natural = handle.result.width;

    (el as unknown as { clientWidth: number }).clientWidth = 340;
    expect(handle.fit().width).toBe(320);
    (el as unknown as { clientWidth: number }).clientWidth = 1000;
    expect(handle.fit().width).toBe(natural);

    globals.getComputedStyle = () => ({ fontFamily: 'Inter', paddingLeft: '0px', paddingRight: '0px', getPropertyValue: () => '' });
    seen.length = 0;
    handle.refresh();
    expect([...new Set(seen)]).toEqual(['Inter']);

    // One that is out of the document waits for fit() to be called when it is back.
    connect(el, false);
    globals.getComputedStyle = () => ({ fontFamily: 'Georgia', paddingLeft: '0px', paddingRight: '0px', getPropertyValue: () => '' });
    seen.length = 0;
    handle.refresh();
    expect(seen.length).toBe(0);
    connect(el, true);
    handle.fit();
    expect([...new Set(seen)]).toEqual(['Georgia']);
  });

  it('stops the diagram an element had when another is mounted in it', () => {
    const doc = page();
    const el = doc.element(500);
    let first = 0;
    let second = 0;
    mountWith(spying(() => first++), el, FLOW);
    mountWith(spying(() => second++), el, SANKEY);
    first = 0;
    doc.loaded();
    resize(el, 340);
    expect(first).toBe(0);
    expect(second).toBeGreaterThan(0);
  });
});
