import type { RenderOptions } from '../types.js';
import { esc, escText } from './builder.js';
import { ROOT_STYLE, fontStyle } from './theme.js';

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
  let weights = '';
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
