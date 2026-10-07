import { detectType, load, render } from 'pele/lazy';
import { metricsMeasurer } from '../../../src/text/measurer';
import { highlightLines, type CodeLanguage } from '../lib/highlight';
import { siteIcon } from '../lib/icons';
import { playgroundHref } from '../lib/playground-link';
import { timed } from '../lib/timing';
import { diagnosis, setStatus } from './playground-status';

function highlight(code: HTMLElement, value: string, language: CodeLanguage): void {
  code.innerHTML = highlightLines(value.split('\n'), language)
    .map((line) => `<span class="doc-code-line"><span class="doc-line-number" hidden></span><span class="doc-code-source">${line}</span></span>`)
    .join('');
}

let drawing = 0;

function select(area: HTMLTextAreaElement, line: number, column: number): void {
  const lines = area.value.split('\n');
  let at = area.value.length;
  // An error found at the end of the text is on a line past the last one.
  if (line <= lines.length) {
    at = 0;
    for (let i = 0; i < line - 1; i++) at += lines[i].length + 1;
    at += Math.min(lines[line - 1].length, Math.max(0, column - 1));
  }
  area.focus();
  area.setSelectionRange(at, Math.min(at + 1, area.value.length));
}

// The width each edited example was last drawn for, and what redraws it when that changes.
const drawnFor = new WeakMap<HTMLElement, number>();
const watched = new WeakSet<HTMLElement>();

// Draws the source beside its code. Without `show`, it only reports how long the drawing the
// page came with takes, and leaves that drawing alone.
async function draw(area: HTMLTextAreaElement, panel: HTMLElement, show = true): Promise<void> {
  const figure = panel.querySelector<HTMLElement>('.home-example-figure');
  const block = figure?.closest<HTMLElement>('.home-example-block');
  const status = panel.querySelector<HTMLElement>('.home-example-status');
  const clock = panel.querySelector<HTMLElement>('.home-example-time');
  if (!figure || !block) return;
  const value = area.value;
  const turn = ++drawing;
  const width = figure.clientWidth;
  let failure: unknown;
  let drawn: { svg: string; type: string } | undefined;
  let time = '';
  try {
    await load(detectType(value));
    if (turn !== drawing) return;
    // Measured as the build measured it, so the drawing the page came with does not move when
    // it is first edited. It is drawn for the room there is, as mount() would draw it.
    const options = { idPrefix: 'home-', measurer: metricsMeasurer, icons: siteIcon, maxWidth: width || undefined };
    ({ result: drawn, time } = timed(() => render(value, options)));
  } catch (error) {
    failure = error;
  }
  if (clock) clock.textContent = drawn ? time : '';
  if (!show) return;

  // What was last drawn stays, dimmed, while the text does not parse.
  if (drawn) figure.innerHTML = drawn.svg;
  block.toggleAttribute('data-error', !drawn);
  area.setAttribute('aria-invalid', String(!drawn));
  if (status) {
    if (drawn) {
      setStatus(status, `Valid ${drawn.type}`, 'success');
    } else {
      const found = diagnosis(failure);
      const message = document.createElement(found.line > 0 ? 'button' : 'div');
      setStatus(message, found.text, 'error');
      if (message instanceof HTMLButtonElement) {
        message.type = 'button';
        message.addEventListener('click', () => select(area, found.line, found.column));
      }
      status.replaceChildren(message);
      status.dataset.state = 'error';
    }
  }

  drawnFor.set(figure, width);
  if (!watched.has(figure) && typeof ResizeObserver !== 'undefined') {
    watched.add(figure);
    new ResizeObserver(() => {
      if (figure.clientWidth !== drawnFor.get(figure)) void draw(area, panel);
    }).observe(figure);
  }

  const link = block.querySelector<HTMLAnchorElement>('.playground-link');
  if (link) {
    try {
      link.href = playgroundHref(value);
    } catch {
      // Too long to carry in a link. The last one that was not stays.
    }
  }
}

let sheet: CSSStyleSheet | undefined;

// Applies the CSS to the example beside it and to nothing else on the page.
function style(value: string, panel: HTMLElement): void {
  const target = panel.querySelector<HTMLElement>('.home-example-light');
  if (!target) return;
  if (!sheet) {
    sheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
  // Read by the browser first, which leaves out what it cannot parse and closes what was left
  // open. Each rule that comes back is then nested under the example.
  const read = new CSSStyleSheet();
  read.replaceSync(value);
  let scoped = '';
  for (const rule of read.cssRules) {
    if (rule instanceof CSSImportRule) continue;
    scoped += `.home-example-light { ${rule.cssText} }\n`;
  }
  sheet.replaceSync(scoped);

  // The surface the diagram sits on follows its background, as a page's would.
  const drawn = target.querySelector('svg.pele');
  const styles = drawn ? getComputedStyle(drawn) : undefined;
  target.style.background = styles?.getPropertyValue('--pele-bg').trim() ?? '';
  const label = target.querySelector<HTMLElement>('.home-example-label');
  if (label) label.style.color = styles?.getPropertyValue('--pele-muted').trim() ?? '';
}

export function edited(kind: 'mermaid' | 'css', area: HTMLTextAreaElement, code: HTMLElement, panel: HTMLElement): void {
  highlight(code, area.value, kind);
  if (kind === 'css') style(area.value, panel);
  else void draw(area, panel);
}

export function measure(area: HTMLTextAreaElement, panel: HTMLElement): void {
  void draw(area, panel, false);
}
