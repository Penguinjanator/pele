// Character tests shared by the hand-written lexers that follow a case-insensitive Jison grammar.

// Whitespace as `\s` sees it.
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

export function isDigit(c: number): boolean {
  return c >= 48 && c <= 57;
}

export function isLetter(c: number): boolean {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
}

export function isWordChar(c: number): boolean {
  return isLetter(c) || isDigit(c) || c === 95;
}

// Whether `word`, written in lower case, is at `at`. Only ASCII letters match in either case,
// as with the `i` flag on a regular expression without the `u` flag.
export function wordAt(src: string, at: number, word: string): boolean {
  for (let k = 0; k < word.length; k++) {
    const c = src.charCodeAt(at + k);
    const w = word.charCodeAt(k);
    if (c !== w && !(w >= 97 && w <= 122 && c === w - 32)) return false;
  }
  return true;
}
