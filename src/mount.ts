import { forgetWidths } from './text/measurer.js';
import type { RenderOptions, RenderResult } from './types.js';
import { room, windowOf } from './window.js';
import { enableZoom, type Zoom, type ZoomOptions } from './zoom.js';

export interface MountOptions extends RenderOptions {
  // Called after the diagram is put in the element, and again each time it is drawn anew.
  onRender?: (result: RenderResult) => void;
  // Whether the diagram can be enlarged and moved about in its box. By default, 'auto', one
  // that was shrunk to fit can be. `true` lets any diagram be, and `false` none. Options for
  // the zoom can be given in place of these.
  zoom?: boolean | 'auto' | ZoomOptions;
}

export interface Mounted {
  // What the element shows now.
  readonly result: RenderResult;
  // The diagram's zoom, unless the `zoom` option is false.
  readonly zoom: Zoom | undefined;
  // Draws other text, or the same text with other options, in the same element. Call it too
  // after moving the element to another window.
  update(text: string, options?: MountOptions): RenderResult;
  // Stops watching the element and the page's fonts. What it shows stays.
  destroy(): void;
}

type Render = (text: string, options: RenderOptions) => RenderResult;

interface Fonts {
  family?: string;
  mono?: string;
}

// The fonts CSS gives the diagram. A variable may be set on the drawing itself, which the
// element that holds it does not inherit, so a drawing that is there is the one asked.
function fontsFor(style: CSSStyleDeclaration, drawing: HTMLElement | null): Fonts {
  const own = drawing ? windowOf(drawing).getComputedStyle(drawing) : style;
  return {
    family: own.getPropertyValue('--pele-font').trim() || style.fontFamily || undefined,
    mono: own.getPropertyValue('--pele-font-mono').trim() || undefined,
  };
}

let forgotten: Event | undefined;

// Puts a diagram in an element and keeps it fitted to the element's width. The element should
// be one whose width does not depend on what it holds, such as a block.
export function mountWith(render: Render, element: HTMLElement, text: string, options: MountOptions = {}): Mounted {
  let source = text;
  let settings = options;
  let natural: RenderResult;
  let shown: RenderResult;
  let fonts: Fonts = {};
  // Whether the width there is can change how this diagram is drawn. Not known until asked.
  let adapts: boolean | undefined;
  let drawnFor = -1;

  const fit = (style: CSSStyleDeclaration, fresh: boolean): RenderResult => {
    const { onRender, ...rest } = settings;
    const base: RenderOptions = {
      ...rest,
      fontFamily: rest.fontFamily ?? fonts.family,
      fontFamilyMono: rest.fontFamilyMono ?? fonts.mono,
      maxWidth: undefined,
    };
    if (fresh) {
      natural = render(source, base);
      adapts = undefined;
    }
    const available = settings.maxWidth ?? room(element, style);
    drawnFor = available;
    if (available > 0 && available < natural.width) {
      // Drawn for no room at all, a diagram that the width can change comes out differently.
      adapts ??= render(source, { ...base, maxWidth: 1 }).svg !== natural.svg;
      if (adapts) return render(source, { ...base, maxWidth: available });
    }
    return natural;
  };

  // A quiet draw leaves the element alone when it would show the same thing.
  const draw = (fresh: boolean, quiet = !fresh): void => {
    const style = windowOf(element).getComputedStyle(element);
    const drawing = (element.firstElementChild as HTMLElement | null) ?? null;
    if (fresh) fonts = fontsFor(style, drawing);
    let next = fit(style, fresh);
    if (quiet && next.svg === shown.svg) return;
    element.innerHTML = next.svg;
    if (fresh && !drawing && element.firstElementChild) {
      const seen = fontsFor(style, element.firstElementChild as HTMLElement);
      if (seen.family !== fonts.family || seen.mono !== fonts.mono) {
        fonts = seen;
        next = fit(style, true);
        element.innerHTML = next.svg;
      }
    }
    shown = next;
    zoomer?.refresh();
    settings.onRender?.(next);
  };

  // Made after the first drawing, and again when the option changes.
  let zoomer: Zoom | undefined;
  let zooming: MountOptions['zoom'] = false;
  const zoom = (): void => {
    const wanted = settings.zoom ?? 'auto';
    if (wanted === zooming) return;
    zoomer?.destroy();
    zooming = wanted;
    zoomer = wanted === false ? undefined : enableZoom(element, typeof wanted === 'object' ? wanted : { always: wanted === true });
  };

  draw(true);
  zoom();

  const resized = (): void => {
    if (adapts === false || settings.maxWidth !== undefined) return;
    const available = room(element, windowOf(element).getComputedStyle(element));
    // An element that wraps the drawing follows its width, which is not a change of room.
    if (available === drawnFor || available === shown.width) return;
    try {
      draw(false);
    } catch {
      // The text drew before. Whatever stops it now, what is shown stays.
    }
  };
  // A font that was still loading was measured as its fallback.
  const remeasure = (event: Event): void => {
    if (event !== forgotten) {
      forgotten = event;
      forgetWidths();
    }
    try {
      draw(true, true);
    } catch {
      // As above.
    }
  };

  let view: typeof globalThis | undefined;
  let observer: ResizeObserver | undefined;
  let loaded: FontFaceSet | undefined;
  const unwatch = (): void => {
    observer?.disconnect();
    loaded?.removeEventListener('loadingdone', remeasure);
  };
  // Watches from the window the element is in now, which changes if a host moves it to another.
  const watch = (): void => {
    const next = windowOf(element);
    if (next === view) return;
    unwatch();
    view = next;
    observer = next.ResizeObserver ? new next.ResizeObserver(resized) : undefined;
    observer?.observe(element);
    loaded = element.ownerDocument?.fonts;
    loaded?.addEventListener('loadingdone', remeasure);
  };
  watch();

  return {
    get result() {
      return shown;
    },
    get zoom() {
      return zoomer;
    },
    update(next, nextOptions) {
      source = next;
      if (nextOptions !== undefined) settings = nextOptions;
      draw(true);
      watch();
      zoom();
      return shown;
    },
    destroy() {
      unwatch();
      zoomer?.destroy();
    },
  };
}
