import { PeleError } from './errors.js';
import { parseYaml, type YamlValue } from './util/yaml.js';

export type Config = { [key: string]: YamlValue };

export interface Preprocessed {
  text: string;
  title: string | undefined;
  config: Config;
}

const RE_COMMENT = /^\s*%%(?!{)[^\n]+\n?/gm;
const RE_DIRECTIVE = /%{2}{\s*(?:(\w+)\s*:|(\w+))\s*(?:(\w+)|((?:(?!}%{2}).|\r?\n)*))?\s*(?:}%{2})?/gi;
const RE_HTML_TAG = /<(\w+)([^>]*)>/g;
const RE_ATTR = /="([^"]*)"/g;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function cleanupComments(text: string): string {
  return (text.includes('%%') ? text.replace(RE_COMMENT, '') : text).trimStart();
}

function isLineBreak(ch: string | undefined): boolean {
  return ch === '\n' || ch === '\r';
}

function isSpace(ch: string | undefined): boolean {
  return ch !== undefined && /\s/.test(ch);
}

interface FrontMatter {
  indent: string;
  body: string;
  length: number;
}

// Finds a `---` fenced YAML block at the start of the text the way Mermaid's front matter regex does.
function matchFrontMatter(text: string): FrontMatter | undefined {
  let cursor = 0;
  while (cursor < text.length && isSpace(text[cursor]) && !isLineBreak(text[cursor])) cursor++;
  const indent = text.slice(0, cursor);
  if (!text.startsWith('---', cursor)) return undefined;

  const openingEnds: number[] = [];
  for (let i = cursor + 3; i < text.length && isSpace(text[i]); i++) {
    if (isLineBreak(text[i])) openingEnds.push(i);
  }
  if (openingEnds.length === 0) return undefined;

  const fence = indent + '---';
  const closingEnd = (i: number): number => {
    if (!isLineBreak(text[i]) || !text.startsWith(fence, i + 1)) return -1;
    let last = -1;
    for (let j = i + 1 + fence.length; j < text.length && isSpace(text[j]); j++) {
      if (isLineBreak(text[j])) last = j;
    }
    return last;
  };

  let lastFence = -1;
  for (let i = openingEnds[0] + 1; i < text.length; i++) if (closingEnd(i) !== -1) lastFence = i;
  if (lastFence === -1) return undefined;

  let openingEnd = openingEnds[0];
  for (const candidate of openingEnds) if (candidate < lastFence) openingEnd = candidate;

  const bodyStart = openingEnd + 1;
  for (let i = bodyStart; i <= lastFence; i++) {
    const end = closingEnd(i);
    if (end !== -1) return { indent, body: text.slice(bodyStart, i), length: end + 1 };
  }
  return undefined;
}

function isRecord(value: unknown): value is Config {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function merge(target: Config, source: Config): Config {
  for (const key of Object.keys(source)) {
    if (UNSAFE_KEYS.has(key)) continue;
    const value = source[key];
    const current = target[key];
    if (isRecord(value) && isRecord(current)) merge(current, value);
    else if (isRecord(value)) target[key] = merge({}, value);
    else target[key] = value;
  }
  return target;
}

function directives(text: string, config: Config): string {
  if (!text.includes('%%{')) return text;
  const normalized = text.trim().replace(/'/g, '"');
  RE_DIRECTIVE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RE_DIRECTIVE.exec(normalized)) !== null) {
    if (match.index === RE_DIRECTIVE.lastIndex) RE_DIRECTIVE.lastIndex++;
    const type = match[1] ?? match[2];
    if (type === 'wrap') {
      config.wrap = true;
    } else if ((type === 'init' || type === 'initialize') && match[4]) {
      try {
        const args: unknown = JSON.parse(match[4].trim());
        if (isRecord(args)) merge(config, args);
      } catch {
        // Mermaid ignores an init directive whose body is not valid JSON.
      }
    }
  }
  RE_DIRECTIVE.lastIndex = 0;
  return text.replace(RE_DIRECTIVE, '');
}

export function preprocess(source: string): Preprocessed {
  let text = source.includes('\r') ? source.replace(/\r\n?/g, '\n') : source;
  // A tag needs a closing bracket, so nothing after the last one can match.
  const lastClose = text.includes('<') ? text.lastIndexOf('>') : -1;
  if (lastClose > 0) {
    text =
      text
        .slice(0, lastClose + 1)
        .replace(RE_HTML_TAG, (_m, tag: string, attrs: string) => '<' + tag + attrs.replace(RE_ATTR, "='$1'") + '>') +
      text.slice(lastClose + 1);
  }

  const config: Config = {};
  let title: string | undefined;

  const front = text.includes('---') ? matchFrontMatter(text) : undefined;
  if (front) {
    const body = front.indent
      ? front.body
          .split('\n')
          .map((line) => (line.startsWith(front.indent) ? line.slice(front.indent.length) : line))
          .join('\n')
      : front.body;
    let parsed: YamlValue;
    try {
      parsed = parseYaml(body);
    } catch (error) {
      throw new PeleError(`Front matter is not valid YAML. ${(error as Error).message}`, 'syntax');
    }
    if (isRecord(parsed)) {
      if (parsed.title) title = String(parsed.title);
      if (isRecord(parsed.config)) merge(config, parsed.config);
      if (parsed.displayMode) {
        const gantt = isRecord(config.gantt) ? config.gantt : (config.gantt = {});
        gantt.displayMode = String(parsed.displayMode);
      }
    }
    text = text.slice(front.length);
  }

  text = directives(text, config);
  return { text: cleanupComments(text), title, config };
}

const RE_ENTITY = /#\w+;/g;
const RE_INT = /^\+?\d+$/;
const RE_LINE_BREAK = new RegExp('[\\n\\r' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');

function isWhitespace(c: number): boolean {
  if (c < 128) return c === 32 || (c >= 9 && c <= 13);
  return (
    c === 0xa0 ||
    c === 0x1680 ||
    (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 ||
    c === 0x2029 ||
    c === 0x202f ||
    c === 0x205f ||
    c === 0x3000 ||
    c === 0xfeff
  );
}

// Does what Mermaid's `text.replace(/keyword.*:\S*#.*;/g, drop the last character)` does:
// on a line where the keyword is followed by a colon, a color-like `#`, and later a semicolon,
// the last semicolon goes. Mermaid's regex backtracks without bound; this is one pass.
function dropColorSemicolons(text: string, keyword: string): string {
  let from = text.indexOf(keyword);
  if (from === -1) return text;
  let out = '';
  let last = 0;
  while (from !== -1) {
    RE_LINE_BREAK.lastIndex = from;
    const lineEnd = RE_LINE_BREAK.test(text) ? RE_LINE_BREAK.lastIndex - 1 : text.length;
    let afterColon = false;
    let hash = -1;
    for (let j = from + keyword.length; j < lineEnd; j++) {
      const c = text.charCodeAt(j);
      if (c === 58) {
        afterColon = true;
      } else if (c === 35) {
        if (afterColon) {
          hash = j;
          break;
        }
      } else if (isWhitespace(c)) {
        afterColon = false;
      }
    }
    if (hash !== -1) {
      const semi = text.lastIndexOf(';', lineEnd - 1);
      if (semi > hash) {
        out += text.slice(last, semi);
        last = semi + 1;
      }
    }
    from = lineEnd >= text.length ? -1 : text.indexOf(keyword, lineEnd + 1);
  }
  return last === 0 ? text : out + text.slice(last);
}

// Mermaid hides `#name;` entity codes behind placeholder characters so `#` and `;` survive parsing.
export function encodeEntities(text: string): string {
  if (!text.includes('#')) return text;
  return dropColorSemicolons(dropColorSemicolons(text, 'style'), 'classDef').replace(RE_ENTITY, (s) => {
    const inner = s.substring(1, s.length - 1);
    return (RE_INT.test(inner) ? 'ﬂ°°' : 'ﬂ°') + inner + '¶ß';
  });
}
