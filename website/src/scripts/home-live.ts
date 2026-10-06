import { renderAsync } from 'pele/lazy';
import { metricsMeasurer } from '../../../src/text/measurer';
import { highlightLines, type CodeLanguage } from '../lib/highlight';
import { siteIcon } from '../lib/icons';
import { playgroundHref } from '../lib/playground-link';

function highlight(code: HTMLElement, value: string, language: CodeLanguage): void {
  code.innerHTML = highlightLines(value.split('\n'), language)
    .map((line) => `<span class="doc-code-line"><span class="doc-line-number" hidden></span><span class="doc-code-source">${line}</span></span>`)
    .join('');
}

// One line for an error: where it is, and the last line of the message, which says what was expected.
function reason(error: unknown): string {
  const lines = (error instanceof Error ? error.message : String(error)).split('\n').filter((line) => line.trim() !== '');
  const said = lines.length > 1 ? lines[lines.length - 1] : (lines[0] ?? '').replace(/:$/, '');
  const line = (error as { line?: number }).line;
  return line ? `Line ${line}: ${said}` : said;
}

let drawing = 0;

async function draw(value: string, panel: HTMLElement): Promise<void> {
  const figure = panel.querySelector<HTMLElement>('.home-example-figure');
  const block = figure?.closest<HTMLElement>('.home-example-block');
  if (!figure || !block) return;
  const turn = ++drawing;
  let message = '';
  let svg = '';
  try {
    // Measured as the build measured it, so the drawing the page came with does not move
    // when it is first edited.
    svg = (await renderAsync(value, { idPrefix: 'home-', measurer: metricsMeasurer, icons: siteIcon })).svg;
  } catch (error) {
    message = reason(error);
  }
  if (turn !== drawing) return;
  if (svg) figure.innerHTML = svg;

  // What was last drawn stays while the text does not parse.
  let note = block.querySelector<HTMLElement>('.home-example-error');
  if (!note) {
    note = document.createElement('p');
    note.className = 'home-example-error';
    note.setAttribute('role', 'status');
    block.append(note);
  }
  note.textContent = message;
  note.title = message;
  block.toggleAttribute('data-error', message !== '');

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

export function edited(kind: 'mermaid' | 'css', value: string, code: HTMLElement, panel: HTMLElement): void {
  highlight(code, value, kind);
  if (kind === 'css') style(value, panel);
  else void draw(value, panel);
}
