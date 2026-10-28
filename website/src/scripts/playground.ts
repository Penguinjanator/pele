import { PeleError, enableZoom, render } from 'pele';
import { editorHighlighting } from '../lib/editor-highlighting';
import { formatSvg } from '../lib/format-svg';
import { siteIcon } from '../lib/icons';
import { playgroundHref, readPlaygroundLink } from '../lib/playground-link';
import { mermaidAutocomplete } from './playground-autocomplete';
import { createPlaygroundEditor } from './playground-editor';
import { setupPlaygroundColumns } from './playground-columns';
import { setupPlaygroundCopy } from './playground-copy';
import { setupArrowKeys } from './playground-keys';
import { playgroundMath } from './playground-math';
import { renderMermaid } from './playground-mermaid';
import { setupPlaygroundSettings } from './playground-settings';
import { setupPlaygroundShare } from './playground-share';
import { formatTime, timed } from '../lib/timing';
import { diagnosis, setStatus } from './playground-status';
import { setupPlaygroundTabs } from './playground-tabs';

type View = 'pele' | 'mermaid' | 'svg' | 'compare';
type Language = 'mermaid' | 'css';

const wrapStorageKey = 'pele:playground:wrap';
const renderDelay = 150;

const readStorage = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The preference still applies for this visit.
  }
};

const root = document.querySelector<HTMLElement>('.playground')!;
const inputPanel = document.getElementById('input-panel')!;
const outputPanel = document.getElementById('output-panel')!;
const preview = document.getElementById('playground-preview')!;
const peleOutput = document.getElementById('pele-output')!;
const zoom = enableZoom(peleOutput);
const mermaidOutput = document.getElementById('mermaid-output')!;
const peleTime = document.getElementById('pele-time')!;
const mermaidTime = document.getElementById('mermaid-time')!;
const samples = JSON.parse(document.getElementById('playground-samples')!.textContent ?? '[]') as string[];

const savedWrap = readStorage(wrapStorageKey);
const initialWrap = savedWrap === 'true' || savedWrap === 'false' ? savedWrap === 'true' : window.matchMedia('(max-width: 760px)').matches;

// The CSS tab starts with every variable at the value the preview uses: the site's theme where
// it sets one, and Pele's default otherwise.
const peleDefaults = {
  bg: '#ffffff', fg: '#1f1f1f', 'fg-on-light': '#1f1f1f', 'fg-on-dark': '#ffffff', muted: '#6e6e6e', line: '#1f1f1f',
  surface: '#f3f3f3', 'surface-alt': '#e6e6e6', border: '#8a8a8a', accent: '#5b7bd5', critical: '#e45756', error: '#e45756',
  font: 'sans-serif', 'font-mono': 'monospace', 'title-weight': 'bold', 'heading-weight': 'bold', 'bold-weight': 'bold', radius: '4px',
  'series-1': '#4c78a8', 'series-2': '#f58518', 'series-3': '#54a24b', 'series-4': '#e45756',
  'series-5': '#72b7b2', 'series-6': '#eeca3b', 'series-7': '#b279a2', 'series-8': '#9d755d',
};
const previewStyle = getComputedStyle(peleOutput);
const defaultCss = `.pele {\n${Object.entries(peleDefaults)
  .map(([name, fallback]) => `  --pele-${name}: ${previewStyle.getPropertyValue(`--pele-${name}`).trim() || fallback};\n`)
  .join('')}}\n`;

const link = readPlaygroundLink(window.location.hash);
if (link) document.querySelector<HTMLTextAreaElement>('#playground-input')!.value = link.source;
document.querySelector<HTMLTextAreaElement>('#playground-css')!.value = link?.css || defaultCss;

const input = createPlaygroundEditor('input', 'Mermaid source', [...editorHighlighting('mermaid'), mermaidAutocomplete()], initialWrap);
const css = createPlaygroundEditor('css', 'CSS for the Pele preview', editorHighlighting('css'), initialWrap);
const output = createPlaygroundEditor('output', 'SVG source', editorHighlighting('xml'), initialWrap);
let language: Language = 'mermaid';
const inputCopy = setupPlaygroundCopy('input', () => (language === 'css' ? 'Copy CSS' : 'Copy source'), () => (language === 'css' ? css : input).value);
const outputCopy = setupPlaygroundCopy('output', () => 'Copy SVG', () => output.value);

let initialSource = input.value;
let initialCss = css.value;
let view: View = 'pele';
let timer: number | undefined;
let peleStatus: { text: string; error: boolean } = { text: '', error: false };
let mermaidStatus = '';
let mermaidRevision = 0;
let mermaidRendered: { source: string } | undefined;

const showsMermaid = () => view === 'mermaid' || view === 'compare';

function showOutputStatus() {
  const text = [peleStatus.text, showsMermaid() ? mermaidStatus : ''].filter(Boolean).join(' · ');
  setStatus(output.status, text, peleStatus.error ? 'error' : '');
}

function showEmpty(element: HTMLElement, message: string) {
  const note = document.createElement('p');
  note.className = 'playground-diagram-empty';
  note.textContent = message;
  element.replaceChildren(note);
  delete element.dataset.stale;
}

function showError(error: unknown) {
  const found = diagnosis(error);
  const located = found.line > 0 ? found : undefined;
  const message = error instanceof Error ? error.message : String(error);
  const rest = message.split('\n').slice(1);

  input.element.setAttribute('aria-invalid', 'true');
  input.status.replaceChildren();
  input.status.dataset.state = 'error';
  const diagnostic = document.createElement(located ? 'button' : 'div');
  diagnostic.className = 'playground-diagnostic';
  setStatus(diagnostic, found.text, 'error');
  if (located && diagnostic instanceof HTMLButtonElement) {
    diagnostic.type = 'button';
    diagnostic.addEventListener('click', () => input.selectDiagnostic(located.line, located.column));
  }
  input.status.append(diagnostic);

  const snippet = error instanceof PeleError ? error.snippet : '';
  const detail = (snippet && !message.includes(snippet) ? [snippet, ...rest] : rest).join('\n').trimEnd();
  if (detail) {
    const block = document.createElement('pre');
    block.className = 'playground-diagnostic-detail';
    block.textContent = detail;
    input.status.append(block);
  }
}

// The CSS tab styles only the Pele preview. Rules that a stray closing brace moves out of
// `@scope` are dropped, and so are rules such as `@property` and `@font-face`, which apply to
// the whole page even inside it. Browsers without `@scope` get no CSS.
const previewSheet = new CSSStyleSheet();
document.adoptedStyleSheets = [...document.adoptedStyleSheets, previewSheet];
const scopedRules = new Set(['CSSStyleRule', 'CSSNestedDeclarations', 'CSSMediaRule', 'CSSSupportsRule', 'CSSContainerRule']);
function dropGlobalRules(parent: CSSGroupingRule) {
  for (let i = parent.cssRules.length - 1; i >= 0; i--) {
    const rule = parent.cssRules[i];
    if (!scopedRules.has(rule.constructor.name)) parent.deleteRule(i);
    else if ('cssRules' in rule) dropGlobalRules(rule as CSSGroupingRule);
  }
}
function applyCss() {
  previewSheet.replaceSync('CSSScopeRule' in window ? `@scope (#pele-output) {\n:scope {\n${css.value}\n}\n}` : '');
  while (previewSheet.cssRules.length > 1) previewSheet.deleteRule(1);
  if (previewSheet.cssRules[0]) dropGlobalRules(previewSheet.cssRules[0] as CSSGroupingRule);
}

// Labels are measured with the preview's fonts, so text fits its nodes. They are read from the
// diagram once it is drawn, since the CSS tab can set them there.
function previewFonts() {
  const style = getComputedStyle(peleOutput.querySelector(':scope > svg') ?? peleOutput);
  const font = (name: string): string | undefined => style.getPropertyValue(name).trim() || undefined;
  return { sans: font('--pele-font'), mono: font('--pele-font-mono') };
}
let drawnFonts = '';
const fontsChanged = () => {
  const fonts = previewFonts();
  return `${fonts.sans}\n${fonts.mono}` !== drawnFonts;
};

let drawnWidth = 0;
let redrawing = false;

function renderPele() {
  const source = input.value;
  inputCopy.refresh();
  if (!source.trim()) {
    input.element.removeAttribute('aria-invalid');
    setStatus(input.status, '');
    showEmpty(peleOutput, 'Enter Mermaid source to render a diagram.');
    output.setValue('', { notify: false });
    peleStatus = { text: '', error: false };
    peleTime.textContent = '';
    outputCopy.refresh();
    showOutputStatus();
    return;
  }
  try {
    const style = getComputedStyle(peleOutput);
    drawnWidth = peleOutput.clientWidth;
    const maxWidth = drawnWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const fonts = previewFonts();
    const options = {
      fontFamily: fonts.sans ?? style.fontFamily,
      fontFamilyMono: fonts.mono,
      idPrefix: 'pele-',
      maxWidth,
      icons: siteIcon,
      math: playgroundMath(source, renderPele),
    };
    const { result, time } = timed(() => render(source, options));

    peleOutput.innerHTML = result.svg;
    drawnFonts = `${fonts.sans}\n${fonts.mono}`;
    // Measure again if the new diagram picks up different fonts.
    if (!redrawing && fontsChanged()) {
      redrawing = true;
      try {
        renderPele();
      } finally {
        redrawing = false;
      }
      return;
    }
    zoom.refresh();
    delete peleOutput.dataset.stale;
    output.setValue(formatSvg(result.svg), { reset: false, notify: false });
    input.element.setAttribute('aria-invalid', 'false');
    setStatus(input.status, `Valid ${result.type}`, 'success');
    peleStatus = { text: `Pele ${time}`, error: false };
    peleTime.textContent = time;
  } catch (error) {
    showError(error);
    // Keep the last good diagram visible, dimmed, while the source is being edited.
    if (peleOutput.querySelector('svg')) peleOutput.dataset.stale = '';
    else showEmpty(peleOutput, 'Pele could not render this diagram.');
    output.setValue('', { notify: false });
    peleStatus = { text: 'Pele could not render this diagram.', error: true };
    peleTime.textContent = '';
  }
  outputCopy.refresh();
  showOutputStatus();
}

async function updateMermaid() {
  if (!showsMermaid()) return;
  const source = input.value;
  if (mermaidRendered?.source === source) return;
  const revision = ++mermaidRevision;
  if (!source.trim()) {
    mermaidRendered = { source };
    showEmpty(mermaidOutput, 'Enter Mermaid source to render a diagram.');
    mermaidStatus = '';
    mermaidTime.textContent = '';
    showOutputStatus();
    return;
  }
  mermaidOutput.setAttribute('aria-busy', 'true');
  if (!mermaidOutput.querySelector('svg')) showEmpty(mermaidOutput, 'Loading Mermaid…');
  mermaidStatus = 'Mermaid rendering…';
  showOutputStatus();
  try {
    const result = await renderMermaid(source, 'dark');
    if (revision !== mermaidRevision) return;
    mermaidRendered = { source };
    mermaidOutput.innerHTML = result.svg;
    delete mermaidOutput.dataset.stale;
    const time = formatTime(result.time);
    mermaidStatus = `Mermaid ${time}`;
    mermaidTime.textContent = time;
  } catch (error) {
    if (revision !== mermaidRevision) return;
    mermaidRendered = { source };
    showEmpty(mermaidOutput, error instanceof Error ? error.message : 'Mermaid could not render this diagram.');
    mermaidStatus = 'Mermaid could not render this diagram.';
    mermaidTime.textContent = '';
  }
  mermaidOutput.removeAttribute('aria-busy');
  showOutputStatus();
}

// Dragging the divider or turning a phone changes the room a chart is drawn for.
let resizeFrame = 0;
new ResizeObserver(() => {
  if (peleOutput.clientWidth === drawnWidth || peleOutput.clientWidth === 0 || !input.value.trim()) return;
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(renderPele);
}).observe(peleOutput);

function renderNow() {
  window.clearTimeout(timer);
  renderPele();
  void updateMermaid();
}

function scheduleRender() {
  window.clearTimeout(timer);
  inputCopy.refresh();
  timer = window.setTimeout(renderNow, renderDelay);
}

function setSource(source: string) {
  initialSource = source;
  input.setValue(source, { notify: false });
  renderNow();
}

input.onChange(scheduleRender);

function cssChanged() {
  applyCss();
  setStatus(css.status, '');
  inputCopy.refresh();
  if (fontsChanged()) scheduleRender();
}
function setCss(text: string) {
  initialCss = text;
  css.setValue(text, { notify: false });
  cssChanged();
}
css.onChange(cssChanged);

const languageButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-language]')];
function setLanguage(next: Language) {
  language = next;
  inputPanel.dataset.language = next;
  languageButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.language === next)));
  inputCopy.refresh();
  void (next === 'css' ? css : input).measure();
}
languageButtons.forEach((button) => button.addEventListener('click', () => setLanguage(button.dataset.language as Language)));
setupArrowKeys(languageButtons);

const viewButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-view]:is(button)')];
function setView(next: View) {
  view = next;
  outputPanel.dataset.view = next;
  viewButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === next)));
  if (next === 'svg') void output.measure();
  showOutputStatus();
  void updateMermaid();
}
viewButtons.forEach((button) => button.addEventListener('click', () => setView(button.dataset.view as View)));
setupArrowKeys(viewButtons);

const wrapButton = document.querySelector<HTMLButtonElement>('#wrap-lines')!;
wrapButton.setAttribute('aria-checked', String(initialWrap));
wrapButton.addEventListener('click', () => {
  const enabled = wrapButton.getAttribute('aria-checked') !== 'true';
  wrapButton.setAttribute('aria-checked', String(enabled));
  input.setWrap(enabled);
  css.setWrap(enabled);
  output.setWrap(enabled);
  writeStorage(wrapStorageKey, String(enabled));
});

window.addEventListener('hashchange', () => {
  const next = readPlaygroundLink(window.location.hash);
  if (!next) return;
  setCss(next.css || defaultCss);
  setSource(next.source);
});
document.getElementById('reset-example')!.addEventListener('click', () => {
  setCss(initialCss);
  setSource(initialSource);
});
document.getElementById('clear-playground')!.addEventListener('click', () => {
  input.setValue('', { notify: false });
  renderNow();
});
document.querySelectorAll<HTMLButtonElement>('[data-playground-sample]').forEach((button) => {
  button.addEventListener('click', () => {
    const sample = samples[Number(button.dataset.playgroundSample)];
    if (sample === undefined) return;
    setSource(sample);
    setLanguage('mermaid');
    document.querySelector<HTMLButtonElement>('[data-playground-tab="input"]')!.click();
  });
});

const fileInput = document.querySelector<HTMLInputElement>('#source-file')!;
let fileRevision = 0;
document.getElementById('open-file')!.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  // Allow selecting the same file again after changing it on disk.
  fileInput.value = '';
  if (!file) return;
  const revision = ++fileRevision;
  try {
    const text = await file.text();
    if (revision !== fileRevision) return;
    setSource(text.replace(/^﻿/, ''));
    setLanguage('mermaid');
    document.querySelector<HTMLButtonElement>('[data-playground-tab="input"]')!.click();
  } catch {
    if (revision === fileRevision) setStatus(input.status, `Could not read ${file.name}. Try opening it again.`, 'error');
  }
});
input.onChange(() => { fileRevision++; });

setupPlaygroundColumns();
setupPlaygroundTabs();
setupPlaygroundSettings();
setupPlaygroundShare(() => playgroundHref(input.value, css.value === defaultCss ? '' : css.value));
root.querySelectorAll('[data-playground-tab]').forEach((tab) => tab.addEventListener('click', () => {
  void input.measure();
  void css.measure();
  void output.measure();
}));

// A font that the CSS tab selects may load only after the diagram is measured with a fallback.
document.fonts.addEventListener('loadingdone', () => {
  if (css.value !== defaultCss && input.value.trim()) scheduleRender();
});

applyCss();
void document.fonts.ready.then(async () => {
  renderNow();
  await Promise.all([input.measure(), css.measure(), output.measure()]);
  requestAnimationFrame(() => root.dispatchEvent(new Event('playground-ready')));
});
