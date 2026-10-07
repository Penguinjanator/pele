import type { RenderOptions } from '../types.js';
import { esc, escText } from './builder.js';
import { RADIUS, ROOT_STYLE, fontStyle } from './theme.js';

// A rectangle's corner radius comes from a variable. Browsers only lately take a variable in the
// `rx` attribute, and all of them take one in a style, so that is where it is written. It goes
// first there, for a radius the diagram's author set to come after it and win.
const ROUNDED = ` rx="${RADIUS}"`;
const RE_ROUNDED = /<rect\b[^>]*>/g;
function rounded(content: string): string {
  if (!content.includes(ROUNDED)) return content;
  return content.replace(RE_ROUNDED, (tag) => {
    const at = tag.indexOf(ROUNDED);
    if (at < 0) return tag;
    const rest = tag.slice(0, at) + tag.slice(at + ROUNDED.length);
    const style = rest.indexOf(' style="');
    if (style >= 0) return `${rest.slice(0, style + 8)}rx:var(--_r);${rest.slice(style + 8)}`;
    const end = rest.endsWith('/>') ? rest.length - 2 : rest.length - 1;
    return `${rest.slice(0, end)} style="rx:var(--_r)"${rest.slice(end)}`;
  });
}

// The weights of bold text, each set only in a diagram that has such text.
const WEIGHTS = [
  ['--_tw', 'title'],
  ['--_hw', 'heading'],
  ['--_w', 'bold'],
];

export interface Accessible {
  accTitle?: string;
  accDescr?: string;
}

// Wraps a diagram's content in the root <svg>, with theme aliases, size, and accessible names.
export function svgDocument(
  type: string,
  width: number,
  height: number,
  fontSize: number,
  options: RenderOptions,
  acc: Accessible,
  content: string
): string {
  const prefix = esc(options.idPrefix ?? 'pele');
  let head = '';
  let aria = '';
  if (acc.accTitle) {
    head += `<title id="${prefix}-title">${escText(acc.accTitle)}</title>`;
    aria += ` aria-labelledby="${prefix}-title"`;
  }
  if (acc.accDescr) {
    head += `<desc id="${prefix}-desc">${escText(acc.accDescr)}</desc>`;
    aria += ` aria-describedby="${prefix}-desc"`;
  }
  const fit = options.responsive === false ? '' : 'max-width:100%;height:auto;';
  content = rounded(content);
  let weights = content.includes('var(--_r)') ? `;--_r:${RADIUS}` : '';
  for (const [alias, name] of WEIGHTS) {
    if (content.includes(`var(${alias})`)) weights += `;${alias}:var(--pele-${name}-weight,bold)`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="pele pele-${type}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="${fit}${ROOT_STYLE}${weights}${esc(fontStyle(fontSize, options.fontFamily, options.fontFamilyMono))}" fill="var(--_fg)" role="graphics-document document" aria-roledescription="${type}"${aria}>` +
    head +
    content +
    '</svg>'
  );
}
