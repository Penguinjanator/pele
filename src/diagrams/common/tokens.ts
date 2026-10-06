import { syntaxError } from '../../errors.js';

// Tokenizer for the diagram types Mermaid defines with Langium grammars. Token types are tried
// in order and the first match wins, as in Chevrotain; the tables in each diagram's folder are
// checked against Mermaid's generated lexers by the tests.

export interface TokenType {
  name: string;
  // A literal string, or a regular expression with the sticky flag.
  pattern: string | RegExp;
  hidden?: boolean;
  // Start of a construct that needs a closer. When this matches but the whole pattern does not,
  // no closer exists in the rest of the text, so the pattern is not tried again.
  opener?: RegExp;
  // Regular expression token types tried when this one matches. The first to match more text
  // replaces it, as Chevrotain's LONGER_ALT does, so a keyword does not split an identifier.
  longer?: readonly TokenType[];
}

export interface Tokens {
  kinds: number[];
  starts: number[];
  ends: number[];
  src: string;
}

export function tokenize(src: string, types: readonly TokenType[], diagram: string): Tokens {
  const kinds: number[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  const dead = new Uint8Array(types.length);
  const n = src.length;
  let p = 0;
  scan: while (p < n) {
    for (let k = 0; k < types.length; k++) {
      if (dead[k]) continue;
      const type = types[k];
      const pattern = type.pattern;
      let end = -1;
      if (typeof pattern === 'string') {
        if (src.startsWith(pattern, p)) end = p + pattern.length;
      } else {
        pattern.lastIndex = p;
        if (pattern.test(src)) {
          end = pattern.lastIndex;
        } else if (type.opener !== undefined) {
          type.opener.lastIndex = p;
          if (type.opener.test(src)) dead[k] = 1;
        }
      }
      if (end > p) {
        let kind = k;
        if (type.longer !== undefined) {
          for (const alt of type.longer) {
            const at = types.indexOf(alt);
            if (dead[at]) continue;
            const re = alt.pattern as RegExp;
            re.lastIndex = p;
            if (re.test(src)) {
              if (re.lastIndex > end) {
                kind = at;
                end = re.lastIndex;
                break;
              }
            } else if (alt.opener !== undefined) {
              alt.opener.lastIndex = p;
              if (alt.opener.test(src)) dead[at] = 1;
            }
          }
        }
        if (!types[kind].hidden) {
          kinds.push(kind);
          starts.push(p);
          ends.push(end);
        }
        p = end;
        continue scan;
      }
    }
    throw syntaxError(diagram, src, p, '', true);
  }
  kinds.push(-1);
  starts.push(n);
  ends.push(n);
  return { kinds, starts, ends, src };
}

export const ACC_DESCR: TokenType = {
  name: 'ACC_DESCR',
  pattern: /[\t ]*accDescr(?:[\t ]*:([^\n\r]*?(?=%%)|[^\n\r]*)|\s*{([^}]*)})/y,
};
export const ACC_TITLE: TokenType = {
  name: 'ACC_TITLE',
  pattern: /[\t ]*accTitle[\t ]*:(?:[^\n\r]*?(?=%%)|[^\n\r]*)/y,
};
export const TITLE: TokenType = {
  name: 'TITLE',
  pattern: /[\t ]*title(?:[\t ][^\n\r]*?(?=%%)|[\t ][^\n\r]*|)/y,
};
export const STRING: TokenType = { name: 'STRING', pattern: /"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/y };
export const NEWLINE: TokenType = { name: 'NEWLINE', pattern: /\r?\n/y };
export const WHITESPACE: TokenType = { name: 'WHITESPACE', pattern: /[\t ]+/y, hidden: true };
export const YAML: TokenType = {
  name: 'YAML',
  pattern: /---[\t ]*\r?\n(?:[\S\s]*?\r?\n)?---(?:\r?\n|(?!\S))/y,
  hidden: true,
  opener: /---[\t ]*\r?\n/y,
};
export const DIRECTIVE: TokenType = {
  name: 'DIRECTIVE',
  pattern: /[\t ]*%%{[\S\s]*?}%%(?:\r?\n|(?!\S))/y,
  hidden: true,
  opener: /[\t ]*%%{/y,
};
export const SINGLE_LINE_COMMENT: TokenType = {
  name: 'SINGLE_LINE_COMMENT',
  pattern: /[\t ]*%%[^\n\r]*/y,
  hidden: true,
};

// Mermaid ends a keyword only at whitespace, a comment, or the end of input.
export function keyword(word: string): TokenType {
  return {
    name: word,
    pattern: new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:(?=%%)|(?!\\S))', 'y'),
  };
}

const RE_ACC_DESCR = /accDescr(?:[\t ]*:([^\n\r]*)|\s*{([^}]*)})/;
const RE_ACC_TITLE = /accTitle[\t ]*:([^\n\r]*)/;
const RE_TITLE = /title([\t ][^\n\r]*|)/;

function single(text: string): string {
  return text.trim().replace(/[\t ]{2,}/gm, ' ');
}

export function titleValue(text: string): string {
  return single(RE_TITLE.exec(text)![1]);
}

export function accTitleValue(text: string): string {
  return single(RE_ACC_TITLE.exec(text)![1]);
}

export function accDescrValue(text: string): string {
  const m = RE_ACC_DESCR.exec(text)!;
  if (m[1] !== undefined) return single(m[1]);
  return m[2]
    .replace(/^\s*/gm, '')
    .replace(/\s+$/gm, '')
    .replace(/[\t ]{2,}/gm, ' ')
    .replace(/[\n\r]{2,}/gm, '\n');
}

const ESCAPES = new Map([
  ['b', '\b'],
  ['f', '\f'],
  ['n', '\n'],
  ['r', '\r'],
  ['t', '\t'],
  ['v', '\v'],
  ['0', '\0'],
]);

export function stringValue(text: string): string {
  if (!text.includes('\\')) return text.slice(1, -1);
  let out = '';
  for (let i = 1; i < text.length - 1; i++) {
    const c = text[i];
    if (c === '\\') {
      const next = text[++i];
      out += ESCAPES.get(next) ?? next;
    } else {
      out += c;
    }
  }
  return out;
}

// Reads tokens for a hand-written parser, with Chevrotain-style messages on failure.
export class Reader {
  i = 0;
  readonly kinds: number[];

  constructor(
    readonly tokens: Tokens,
    readonly types: readonly TokenType[],
    readonly diagram: string
  ) {
    this.kinds = tokens.kinds;
  }

  get kind(): number {
    return this.kinds[this.i];
  }

  text(index = this.i): string {
    return this.tokens.src.slice(this.tokens.starts[index], this.tokens.ends[index]);
  }

  take(): string {
    return this.text(this.i++);
  }

  accept(kind: number): boolean {
    if (this.kinds[this.i] !== kind) return false;
    this.i++;
    return true;
  }

  expect(kind: number): string {
    if (this.kinds[this.i] !== kind) this.fail(`token of type '${this.types[kind].name}'`);
    return this.take();
  }

  fail(expected: string): never {
    const found = this.kind === -1 ? 'end of input' : `\`${this.text()}\``;
    throw syntaxError(this.diagram, this.tokens.src, this.tokens.starts[this.i], `Expecting ${expected} but found ${found}.`);
  }
}
