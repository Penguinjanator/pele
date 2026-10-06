import type { RenderOptions, RenderResult } from './types.js';

export interface MountOptions extends RenderOptions {
  // Called after the diagram is put in the element, and again each time it is drawn anew.
  onRender?: (result: RenderResult) => void;
}

export interface Mounted {
  // What the element shows now.
  readonly result: RenderResult;
  // Draws other text, or the same text with other options, in the same element.
  update(text: string, options?: MountOptions): RenderResult;
  // Stops watching the element. What it shows stays.
  destroy(): void;
}

type Render = (text: string, options: RenderOptions) => RenderResult;

// The width inside the element's padding, or 0 when it has none yet.
function room(element: HTMLElement, style: CSSStyleDeclaration): number {
  const width = element.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
  return width > 0 ? width : 0;
}

// Puts a diagram in an element and keeps it fitted to the element's width. The element should
// be one whose width does not depend on what it holds, such as a block.
export function mountWith(render: Render, element: HTMLElement, text: string, options: MountOptions = {}): Mounted {
  let source = text;
  let settings = options;
  let natural: RenderResult;
  let shown: RenderResult;
  // False once a narrower width is seen to make no difference to this diagram.
  let adapts = true;
  let drawnFor = -1;

  const draw = (fresh: boolean): void => {
    const style = getComputedStyle(element);
    const { onRender, ...rest } = settings;
    const base: RenderOptions = { ...rest, fontFamily: rest.fontFamily ?? style.fontFamily, maxWidth: undefined };
    if (fresh) {
      natural = render(source, base);
      adapts = true;
    }
    const available = settings.maxWidth ?? room(element, style);
    drawnFor = available;
    let next = natural;
    if (adapts && available > 0 && available < natural.width) {
      const fitted = render(source, { ...base, maxWidth: available });
      if (fitted.svg === natural.svg) adapts = false;
      else next = fitted;
    }
    if (!fresh && next.svg === shown.svg) return;
    shown = next;
    element.innerHTML = next.svg;
    onRender?.(next);
  };

  draw(true);

  const observer =
    typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(() => {
          if (!adapts || settings.maxWidth !== undefined) return;
          const available = room(element, getComputedStyle(element));
          // An element that wraps the drawing follows its width, which is not a change of room.
          if (available === drawnFor || available === shown.width) return;
          try {
            draw(false);
          } catch {
            // The text drew before. Whatever stops it now, what is shown stays.
          }
        });
  observer?.observe(element);

  return {
    get result() {
      return shown;
    },
    update(next, nextOptions) {
      source = next;
      if (nextOptions !== undefined) settings = nextOptions;
      draw(true);
      return shown;
    },
    destroy() {
      observer?.disconnect();
    },
  };
}
