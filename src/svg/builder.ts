import { Style } from '../text/measurer.js';
import type { Label } from '../text/label.js';
import type { IconResolver } from '../types.js';

export type { IconResolver };

const RE_NEEDS_ESC = /[&<>"\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const RE_ESC = /[&<>"]|[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]+/g;
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

// Escapes text for XML and drops the control characters XML does not allow.
export function esc(text: string): string {
  return RE_NEEDS_ESC.test(text) ? text.replace(RE_ESC, (c) => ESC[c] ?? '') : text;
}

// The two decimals of a coordinate, by hundredths. Building the string from integers is much
// faster than converting a double.
const FRACTION: string[] = [];
for (let i = 0; i < 100; i++) FRACTION.push(i === 0 ? '' : i % 10 === 0 ? '.' + i / 10 : '.' + (i < 10 ? '0' + i : i));

export function num(value: number): string {
  const n = Math.round(value * 100);
  if (n === 0) return '0';
  if (n > 0) {
    if (n < 1e11) {
      const q = Math.floor(n / 100);
      return q + FRACTION[n - q * 100];
    }
  } else if (n > -1e11) {
    const m = -n;
    const q = Math.floor(m / 100);
    return '-' + q + FRACTION[m - q * 100];
  }
  return String(n / 100);
}


// Writes a measured label as SVG text centered on (cx, cy).
export function labelSvg(label: Label, cx: number, cy: number, attrs: string, icons?: IconResolver): string {
  const lines = label.lines;
  if (lines.length === 0) return '';
  const lh = label.lineHeight;
  const shift = label.size * 0.35;
  let y = cy - label.height / 2 + lh / 2 + shift;

  if (lines.length === 1 && lines[0].length === 1 && lines[0][0].icon === undefined && lines[0][0].style === 0) {
    return `<text${attrs} x="${num(cx)}" y="${num(y)}" text-anchor="middle">${esc(lines[0][0].text)}</text>`;
  }

  let body = '';
  let extra = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let hasIcon = false;
    for (const span of line) if (span.icon !== undefined) hasIcon = true;
    if (hasIcon) {
      let x = cx - label.widths[i] / 2;
      for (const span of line) {
        if (span.icon !== undefined) {
          const side = label.size * 1.1;
          const inner = icons?.(span.icon) ?? '';
          extra += `<svg class="pele-icon" data-icon="${esc(span.icon)}" x="${num(x)}" y="${num(
            y - shift - side / 2
          )}" width="${num(side)}" height="${num(side)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
        } else if (span.text !== '') {
          body += `<tspan x="${num(x)}" y="${num(y)}" text-anchor="start"${spanStyle(span.style)}>${esc(span.text)}</tspan>`;
        }
        x += span.width;
      }
    } else {
      for (let j = 0; j < line.length; j++) {
        const span = line[j];
        const pos = j === 0 ? ` x="${num(cx)}" y="${num(y)}"` : '';
        body += `<tspan${pos}${spanStyle(span.style)}>${esc(span.text)}</tspan>`;
      }
      if (line.length === 0) body += `<tspan x="${num(cx)}" y="${num(y)}"> </tspan>`;
    }
    y += lh;
  }
  return `<text${attrs} text-anchor="middle" xml:space="preserve">${body}</text>${extra}`;
}

export function spanStyle(style: number): string {
  return (style & Style.Bold ? ' font-weight="bold"' : '') + (style & Style.Italic ? ' font-style="italic"' : '');
}
