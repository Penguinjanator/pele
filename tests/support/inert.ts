import { expect } from 'vitest';
import { assertWellFormed, elements } from './xml.js';

// Pele's output is inserted into pages as markup, so it must be inert whatever the diagram says:
// only drawing elements, only presentation attributes, no script-capable URLs, no way to load a stylesheet.
// A new diagram type that needs another element or attribute adds it here, with care.

const ELEMENTS = new Set(['svg', 'g', 'rect', 'circle', 'ellipse', 'polygon', 'path', 'text', 'tspan', 'a', 'title', 'desc', 'image']);
const ATTRIBUTES = new Set([
  'xmlns', 'class', 'viewBox', 'width', 'height', 'style', 'font-family', 'font-size', 'font-weight', 'font-style',
  'fill', 'fill-opacity', 'opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin',
  'role', 'aria-roledescription', 'aria-labelledby', 'aria-describedby', 'id', 'data-id', 'data-icon', 'data-href',
  'transform', 'x', 'y', 'rx', 'ry', 'r', 'cx', 'cy', 'd', 'points', 'text-anchor', 'xml:space',
  'href', 'target', 'rel', 'preserveAspectRatio',
]);
const STYLE_PROPERTIES = new Set([
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap',
  'stroke-linejoin', 'stroke-opacity', 'opacity', 'rx', 'ry', 'font-size', 'font-family', 'font-weight', 'font-style',
  'text-decoration', 'letter-spacing', 'word-spacing', 'max-width',
]);
const NUMERIC = new Set(['x', 'y', 'width', 'height', 'r', 'cx', 'cy', 'rx', 'ry']);

export function assertInert(svg: string, where: string): void {
  expect(() => assertWellFormed(svg), where).not.toThrow();
  for (const el of elements(svg)) {
    expect(ELEMENTS.has(el.name), `${where}: element <${el.name}>`).toBe(true);
    for (const [name, value] of el.attrs) {
      expect(ATTRIBUTES.has(name), `${where}: attribute ${name} on <${el.name}>`).toBe(true);
      if (NUMERIC.has(name)) expect(value, `${where}: ${name}`).toMatch(/^(?:-?\d+(?:\.\d+)?(?:e[-+]?\d+)?|100%|var\(--pele-radius,4px\))$/);
      if (name === 'href') {
        expect(el.name === 'a' || el.name === 'image', `${where}: href on <${el.name}>`).toBe(true);
        expect(value, `${where}: href`).not.toMatch(/^[\s\u0000-\u001f]*(?:javascript|vbscript|data)\s*:/i);
      }
      if (name === 'target') expect(value, `${where}: target`).toMatch(/^_(?:self|blank|parent|top)$/);
      if (name === 'style') {
        expect(value, `${where}: style`).not.toMatch(/url\s*\(|expression|@import|javascript:|[<>{}\\]/i);
        for (const decl of value.split(';')) {
          if (decl.trim() === '') continue;
          const prop = decl.slice(0, decl.indexOf(':')).trim();
          expect(STYLE_PROPERTIES.has(prop) || prop.startsWith('--_'), `${where}: style property ${prop}`).toBe(true);
        }
      }
      if (['fill', 'stroke', 'font-family', 'rx'].includes(name)) {
        expect(value, `${where}: ${name}`).not.toMatch(/url\s*\(|javascript:/i);
      }
    }
  }
}


// Text an attacker might put anywhere a diagram accepts a string.
export const PAYLOADS = [
  '<script>alert(1)</script>',
  '"><script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '<a href="javascript:alert(1)">x</a>',
  '<foreignObject><iframe src=javascript:alert(1)></iframe></foreignObject>',
  '</text></g></svg><script>alert(1)</script>',
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  ' javascript:alert(1)',
  'jav&#x09;ascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  "' onload='alert(1)",
  '" onmouseover="alert(1)',
  'x" onclick="alert(1)" y="',
  '#60;script#62;alert(1)#60;/script#62;',
  '&lt;script&gt;alert(1)&lt;/script&gt;',
  '&#60;script&#62;',
  'url(javascript:alert(1))',
  'expression(alert(1))',
  'red;background:url(//evil.example/x)',
  'red" onload="alert(1)',
  ']]><script>alert(1)</script>',
  '--><script>alert(1)</script>',
  '\u0000\u0001\u0008\u000b\u001f',
  '__proto__',
  'constructor',
  'toString',
  'hasOwnProperty',
  '{{7*7}}',
  '${alert(1)}',
  '%0ajavascript:alert(1)',
  '\\"><script>',
];
