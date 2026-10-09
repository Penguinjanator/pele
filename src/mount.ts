import type { DiagramModel } from './models.js';
import { forgetTextWidths } from './text/measurer.js';
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
  // Whether the element's width and the page's fonts are watched, and the diagram drawn again
  // when they change. They are by default. A host that knows when they change can pass `false`
  // and call fit() and refresh() itself: nothing is observed then, on the element or the page.
  watch?: boolean;
}

export interface Mounted {
  readonly result: RenderResult;
  // The diagram's zoom, unless the `zoom` option is false.
  readonly zoom: Zoom | undefined;
  // Draws other text, or the same text with other options, in the same element. Text that
  // cannot be drawn throws, and leaves the diagram as it was. If `onRender` throws, the new
  // drawing is already in place and stays.
  update(text: string, options?: MountOptions): RenderResult;
  // Draws for the width the element has now, where that changes the drawing. A host that
  // passed `watch: false` calls it when the element's size changes or it is put in a document.
  fit(): RenderResult;
  // Measures with the fonts the element has now, and draws again if anything moved. For after
  // a change of theme or font, after the element is moved to another window, and with
  // `watch: false` after a font has loaded.
  refresh(): RenderResult;
  // Stops watching the element and the page's fonts. What it shows stays.
  destroy(): void;
}

// What a diagram is parsed and drawn with: the functions of the entry point that mounted it.
export interface Engine {
  parse(text: string, options: RenderOptions): DiagramModel;
  render(model: DiagramModel, options: RenderOptions): RenderResult;
}

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

// The fonts of a document have one listener, however many diagrams are mounted in it, and it
// holds their elements weakly. A listener for each diagram would keep every element that was
// ever mounted, and all it holds, for as long as the document lasts.
const waiting = new WeakMap<FontFaceSet, Set<WeakRef<HTMLElement>>>();
const remeasures = new WeakMap<HTMLElement, () => void>();
// Takes the reference to a collected element out of its set. Without it a document whose fonts
// have all loaded would keep one for every diagram it ever dropped.
const collected = new FinalizationRegistry<{ elements: Set<WeakRef<HTMLElement>>; reference: WeakRef<HTMLElement> }>(
  ({ elements, reference }) => elements.delete(reference)
);

function awaitFonts(fonts: FontFaceSet, target: HTMLElement, element: WeakRef<HTMLElement>): void {
  let elements = waiting.get(fonts);
  if (!elements) {
    const mounted = (elements = new Set());
    waiting.set(fonts, mounted);
    fonts.addEventListener('loadingdone', () => {
      // A font that was still loading was measured as its fallback.
      forgetTextWidths();
      for (const each of [...mounted]) {
        const element = each.deref();
        if (element) remeasures.get(element)?.();
        else mounted.delete(each);
      }
    });
  }
  elements.add(element);
  collected.register(target, { elements, reference: element }, element);
}

const mounts = new WeakMap<HTMLElement, Mounted>();

// Puts a diagram in an element and keeps it fitted to the element's width. The element should
// be one whose width does not depend on what it holds, such as a block.
export function mountWith(engine: Engine, element: HTMLElement, text: string, options: MountOptions = {}): Mounted {
  // An element shows one diagram. Mounting another stops the one before it.
  mounts.get(element)?.destroy();

  let source = text;
  let settings = options;
  let model = engine.parse(text, options);
  let natural: RenderResult;
  let shown: RenderResult;
  let fonts: Fonts = {};
  // Whether the width there is can change how this diagram is drawn. Not known until asked.
  let adapts: boolean | undefined;
  let drawnFor = -1;
  // An element that is not in a document has neither fonts nor a width to read, so what is
  // drawn for it is a guess. It is drawn again when the element is next given room.
  let guessed = false;

  const fit = (style: CSSStyleDeclaration, fresh: boolean): RenderResult => {
    const { onRender, ...rest } = settings;
    const base: RenderOptions = {
      ...rest,
      fontFamily: rest.fontFamily ?? fonts.family,
      fontFamilyMono: rest.fontFamilyMono ?? fonts.mono,
      maxWidth: undefined,
    };
    if (fresh) {
      natural = engine.render(model, base);
      adapts = undefined;
    }
    const available = settings.maxWidth ?? room(element, style);
    drawnFor = available;
    if (available > 0 && available < natural.width) {
      // Drawn for no room at all, a diagram that the width can change comes out differently.
      adapts ??= engine.render(model, { ...base, maxWidth: 1 }).svg !== natural.svg;
      if (adapts) return engine.render(model, { ...base, maxWidth: available });
    }
    return natural;
  };

  // A quiet draw leaves the element alone when it would show the same thing.
  const draw = (fresh: boolean, quiet = !fresh): void => {
    const style = windowOf(element).getComputedStyle(element);
    const drawing = (element.firstElementChild as HTMLElement | null) ?? null;
    if (fresh) {
      fonts = fontsFor(style, drawing);
      guessed = element.isConnected === false;
    }
    let next = fit(style, fresh);
    if (quiet && next.svg === shown.svg) return;
    element.innerHTML = next.svg;
    if (fresh && !drawing && element.firstElementChild) {
      const seen = fontsFor(style, element.firstElementChild as HTMLElement);
      if (seen.family !== fonts.family || seen.mono !== fonts.mono) {
        const first = { fonts, natural, adapts, drawnFor };
        fonts = seen;
        try {
          next = fit(style, true);
          element.innerHTML = next.svg;
        } catch {
          // What was drawn for the element's own font is in the element, and stays.
          ({ fonts, natural, adapts, drawnFor } = first);
        }
      }
    }
    // From here the drawing is the one shown. Nothing above throws once the element has changed.
    shown = next;
    zoomer?.refresh();
    settings.onRender?.(next);
  };

  // Made after the first drawing, and again when the option changes.
  let zoomer: Zoom | undefined;
  let zooming: MountOptions['zoom'] = false;
  let zoomWatched: boolean | undefined;
  const zoom = (): void => {
    const wanted = settings.zoom ?? 'auto';
    const watched = settings.watch !== false;
    if (wanted === zooming && watched === zoomWatched) return;
    zoomer?.destroy();
    zooming = wanted;
    zoomWatched = watched;
    zoomer =
      wanted === false
        ? undefined
        : enableZoom(element, { ...(typeof wanted === 'object' ? wanted : { always: wanted === true }), watch: watched });
  };

  draw(true);
  zoom();

  // The text drew before. Whatever stops it now, what is shown stays.
  const quietly = (fresh: boolean): void => {
    try {
      draw(fresh, true);
    } catch {
    }
  };
  const resized = (): void => {
    if (guessed) {
      if (element.isConnected !== false) quietly(true);
      return;
    }
    if (adapts === false || settings.maxWidth !== undefined) return;
    const available = room(element, windowOf(element).getComputedStyle(element));
    // An element with no width is hidden or out of the document. What it shows is left for
    // when it is seen again, most often at the width it had.
    if (available === 0) return;
    // An element that wraps the drawing follows its width, which is not a change of room.
    if (available !== drawnFor && available !== shown.width) quietly(false);
  };
  const remeasure = (): void => {
    // Out of the document there are no fonts to read. It is drawn when it is back in one.
    if (element.isConnected === false) guessed = true;
    else quietly(true);
  };

  let view: typeof globalThis | undefined;
  let observer: ResizeObserver | undefined;
  let loaded: FontFaceSet | undefined;
  const self = new WeakRef(element);
  const unwatch = (): void => {
    observer?.disconnect();
    observer = undefined;
    if (loaded) waiting.get(loaded)?.delete(self);
    collected.unregister(self);
    loaded = undefined;
    remeasures.delete(element);
    view = undefined;
  };
  // Watches from the window the element is in now, which changes if a host moves it to another.
  const watch = (): void => {
    if (settings.watch === false) {
      unwatch();
      return;
    }
    const next = windowOf(element);
    if (next === view) return;
    unwatch();
    view = next;
    observer = next.ResizeObserver ? new next.ResizeObserver(resized) : undefined;
    observer?.observe(element);
    loaded = element.ownerDocument?.fonts;
    if (loaded) {
      remeasures.set(element, remeasure);
      awaitFonts(loaded, element, self);
    }
  };
  watch();

  const handle: Mounted = {
    get result() {
      return shown;
    },
    get zoom() {
      return zoomer;
    },
    update(next, nextOptions = settings) {
      const before = { source, settings, model, natural, fonts, adapts, drawnFor, guessed };
      const was = shown;
      try {
        // The same text under the same limits is the same model.
        if (
          next !== source ||
          nextOptions.limit !== settings.limit ||
          nextOptions.maxEdges !== settings.maxEdges ||
          nextOptions.config !== settings.config
        ) {
          model = engine.parse(next, nextOptions);
        }
        source = next;
        settings = nextOptions;
        draw(true);
      } catch (error) {
        // Text that could not be drawn left the element alone. If the element has the new
        // drawing, it was the host's onRender that threw, and the update stands.
        if (shown === was) {
          ({ source, settings, model, natural, fonts, adapts, drawnFor, guessed } = before);
          throw error;
        }
        watch();
        zoom();
        throw error;
      }
      watch();
      zoom();
      return shown;
    },
    fit() {
      resized();
      // A zoom that watches has seen the change for itself.
      if (settings.watch === false) zoomer?.resized();
      return shown;
    },
    refresh() {
      // The element may be in another window than it was, with other fonts and another observer.
      watch();
      remeasure();
      zoomer?.resized();
      return shown;
    },
    destroy() {
      unwatch();
      zoomer?.destroy();
      if (mounts.get(element) === handle) mounts.delete(element);
    },
  };
  mounts.set(element, handle);
  return handle;
}
