import type { DiagramType } from '../detect.js';
import type { Config } from '../preprocess.js';
import { esc } from './builder.js';

// Mermaid's palette theme variables, which set a diagram's own series colors. `first` is the
// number of the variable for the first series. Mindmap branches start at cScale1, as cScale0
// is the root's in Mermaid's styles. A venn palette repeats the colors it sets, as in Mermaid.
const PALETTES: Partial<Record<DiagramType, { prefix: string; first: number; repeat?: boolean }>> = {
  pie: { prefix: 'pie', first: 1 },
  gitGraph: { prefix: 'git', first: 0 },
  timeline: { prefix: 'cScale', first: 0 },
  radar: { prefix: 'cScale', first: 0 },
  treemap: { prefix: 'cScale', first: 0 },
  mindmap: { prefix: 'cScale', first: 1 },
  venn: { prefix: 'venn', first: 1, repeat: true },
};

const SLOTS = 8;
const RE_CHARS = /^[\w\s#%.,+\-/()]{1,200}$/;
const RE_FUNCTION = /([\w-]*)\s*\(/g;
const FUNCTIONS = new Set([
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'hwb',
  'lab',
  'lch',
  'oklab',
  'oklch',
  'color',
  'color-mix',
  'light-dark',
  'var',
]);

function record(value: unknown): Config {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Config) : {};
}

// A color that can't load a resource or end its declaration.
function safeColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const color = value.trim();
  if (!RE_CHARS.test(color)) return undefined;
  let depth = 0;
  for (const char of color) {
    if (char === '(') depth++;
    else if (char === ')' && --depth < 0) return undefined;
  }
  if (depth !== 0) return undefined;
  for (const [, name] of color.matchAll(RE_FUNCTION)) {
    if (!FUNCTIONS.has(name.toLowerCase())) return undefined;
  }
  return color;
}

// Splits at the commas between colors, not those inside rgb() and other functions.
function splitList(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === ',' && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts.map((part) => part.trim());
}

function entries(type: DiagramType, vars: Config): { list: unknown[]; repeat: boolean } | undefined {
  if (type === 'xychart') {
    const list = record(vars.xyChart).plotColorPalette;
    return typeof list === 'string' ? { list: splitList(list), repeat: true } : undefined;
  }
  const palette = PALETTES[type];
  if (palette === undefined) return undefined;
  let list: unknown[] = [];
  for (let i = 0; i < SLOTS; i++) list.push(vars[palette.prefix + (palette.first + i)]);
  if (palette.repeat) list = list.filter((value) => value !== undefined && value !== null && value !== '');
  return { list, repeat: palette.repeat === true };
}

// The --pele-series-* declarations for the palette a diagram's theme variables set. An entry
// that isn't a usable color leaves its series in the theme's color.
export function paletteStyle(type: DiagramType, config: Config): string {
  const found = entries(type, record(config.themeVariables));
  if (found === undefined || found.list.length === 0) return '';
  const { list, repeat } = found;
  let style = '';
  for (let i = 0; i < SLOTS; i++) {
    if (!repeat && i >= list.length) break;
    const color = safeColor(list[i % list.length]);
    if (color !== undefined) style += `;--pele-series-${i + 1}:${color}`;
  }
  return esc(style);
}

let current = '';

export function withPalette<T>(style: string, run: () => T): T {
  const outer = current;
  current = style;
  try {
    return run();
  } finally {
    current = outer;
  }
}

export const currentPalette = (): string => current;
