import { Style } from '../text/measurer.js';
import type { Label } from '../text/label.js';

const RE_NEEDS_ESC = /[&<>"\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const RE_ESC = /[&<>"]|[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]+/g;
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

// Escapes text for XML and drops the control characters XML does not allow.
export function esc(text: string): string {
  return RE_NEEDS_ESC.test(text) ? text.replace(RE_ESC, (c) => ESC[c] ?? '') : text;
}

export function num(value: number): string {
  const r = Math.round(value * 100) / 100;
  return r === 0 ? '0' : String(r);
}

export type IconResolver = (name: string) => string | null | undefined;

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

function spanStyle(style: number): string {
  return (style & Style.Bold ? ' font-weight="bold"' : '') + (style & Style.Italic ? ' font-style="italic"' : '');
}
