// The home page's examples can be edited. The page arrives drawn; what an edit needs is
// fetched once the page is idle, or sooner if someone goes to a code block.
type Live = typeof import('./home-live');

let live: Promise<Live> | undefined;
const load = (): Promise<Live> => (live ??= import('./home-live'));

// Each line's text is in its own element, with nothing between them.
function sourceOf(code: HTMLElement): string {
  return [...code.querySelectorAll<HTMLElement>('.doc-code-source')].map((line) => line.textContent ?? '').join('\n');
}

// iOS zooms the page when a field with small text takes the focus. The playground does the same.
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
if (isIOS) {
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (viewport) viewport.content += ', maximum-scale=1';
}

for (const block of document.querySelectorAll<HTMLElement>('[data-home-editor]')) {
  const pre = block.querySelector('pre');
  const code = pre?.querySelector<HTMLElement>('code');
  const panel = block.closest('.home-example-panel');
  if (!pre || !code || !panel) continue;

  // A field with invisible text lies over the highlighted code, which is redrawn to match it.
  const area = document.createElement('textarea');
  area.className = 'home-editor';
  area.value = sourceOf(code);
  area.spellcheck = false;
  area.autocapitalize = 'off';
  area.autocomplete = 'off';
  area.setAttribute('autocorrect', 'off');
  area.setAttribute('aria-label', block.dataset.homeEditor === 'css' ? 'CSS for the diagram' : 'Mermaid source of the diagram');
  const status = block.querySelector('.home-example-status');
  if (status?.id) area.setAttribute('aria-describedby', status.id);
  pre.append(area);

  for (const event of ['pointerenter', 'focusin', 'touchstart']) block.addEventListener(event, () => void load(), { once: true, passive: true });

  // The first example says how long its drawing takes, which means drawing it once more.
  if (panel.querySelector('.home-example-time')) {
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 200));
    const time = (): void => void idle(() => void load().then((module) => module.measure(area, panel as HTMLElement)));
    if (document.readyState === 'complete') time();
    else window.addEventListener('load', time, { once: true });
  }

  let pending = 0;
  area.addEventListener('input', () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      void load().then((module) => module.edited(block.dataset.homeEditor === 'css' ? 'css' : 'mermaid', area, code, panel as HTMLElement));
    });
  });

  // A new line starts where the one before it did.
  area.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
    const before = area.value.slice(0, area.selectionStart);
    const indent = /[ \t]*/.exec(before.slice(before.lastIndexOf('\n') + 1))?.[0] ?? '';
    if (indent === '') return;
    event.preventDefault();
    // Keeps the edit in the field's own undo history, where setting the value would not.
    document.execCommand('insertText', false, '\n' + indent);
  });
}
