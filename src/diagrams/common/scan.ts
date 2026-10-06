// Lexer rules that Mermaid's journey and timeline grammars have in common, ported from the
// compiled Jison rules: comments, whitespace, and the accTitle and accDescr statements.

export interface Tokens {
  types: number[];
  texts: string[];
  starts: number[];
}

export function isSpace(c: number): boolean {
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

export function isWord(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
}

export function lineEnd(src: string, from: number): number {
  const at = src.indexOf('\n', from);
  return at === -1 ? src.length : at;
}

// `word` is lowercase ASCII letters; the grammars are case-insensitive.
export function keywordAt(src: string, p: number, word: string): boolean {
  for (let i = 0; i < word.length; i++) {
    if ((src.charCodeAt(p + i) | 32) !== word.charCodeAt(i)) return false;
  }
  return true;
}

// Skips comments and whitespace. Stops at a line break that starts a token, which is a NEWLINE.
// Jison compiles `\%%` to a single `%`, so one percent sign starts a comment, and the second
// comment rule takes any character before `%%` with it, a line break included.
export function skipTrivia(src: string, from: number): number {
  const n = src.length;
  let p = from;
  while (p < n) {
    const c = src.charCodeAt(p);
    if (c === 37 && src.charCodeAt(p + 1) !== 123) {
      p = lineEnd(src, p);
    } else if (c !== 125 && src.charCodeAt(p + 1) === 37 && src.charCodeAt(p + 2) === 37) {
      p = lineEnd(src, p + 3);
    } else if (c === 10) {
      return p;
    } else if (isSpace(c)) {
      do p++;
      while (p < n && isSpace(src.charCodeAt(p)));
    } else if (c === 35) {
      p = lineEnd(src, p);
    } else {
      return p;
    }
  }
  return p;
}

function skipSpace(src: string, from: number): number {
  let p = from;
  while (isSpace(src.charCodeAt(p))) p++;
  return p;
}

// Lexes an accTitle or accDescr statement at `p` and returns where it ends, or `p` if there is none.
// The token types acc_title, acc_title_value, acc_descr, acc_descr_value and
// acc_descr_multiline_value must be numbered consecutively from `first`.
export function accessibility(src: string, p: number, out: Tokens, first: number): number {
  const descr = keywordAt(src, p, 'accdescr');
  if (!descr && !keywordAt(src, p, 'acctitle')) return p;
  const n = src.length;
  let q = skipSpace(src, p + 8);
  const c = src.charCodeAt(q);
  const emit = (type: number, s: number, e: number): void => {
    out.types.push(type);
    out.texts.push(src.slice(s, e));
    out.starts.push(s);
  };
  if (c === 58) {
    q = skipSpace(src, q + 1);
    const end = lineEnd(src, q);
    emit(descr ? first + 2 : first, p, q);
    emit(descr ? first + 3 : first + 1, q, end);
    return end;
  }
  if (!descr || c !== 123) return p;
  q = skipSpace(src, q + 1);
  while (src.charCodeAt(q) !== 125) {
    let end = src.indexOf('}', q);
    if (end === -1) end = n;
    emit(first + 4, q, end);
    if (q === n) return n;
    q = end;
  }
  return q + 1;
}
