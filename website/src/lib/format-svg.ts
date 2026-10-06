// Whitespace inside these elements is content, so they stay on one line.
const preserved = new Set(['text', 'title', 'desc', 'style', 'script', 'foreignObject']);

// Indents Pele's single-line SVG for reading. Display only: the library's
// output is unchanged, and anything unexpected is returned as it was.
export function formatSvg(source: string): string {
  const tokens = source.match(/<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/g) ?? [];
  const lines: string[] = [];
  let depth = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token.startsWith('<')) {
      if (token.trim()) lines.push('  '.repeat(depth) + token.trim());
      continue;
    }
    const name = token.match(/^<\/?([\w:.-]+)/)?.[1];
    if (!name) {
      lines.push('  '.repeat(depth) + token);
    } else if (token.startsWith('</')) {
      if (--depth < 0) return source;
      lines.push('  '.repeat(depth) + token);
    } else if (token.endsWith('/>')) {
      lines.push('  '.repeat(depth) + token);
    } else if (preserved.has(name)) {
      let nested = 1;
      let end = index;
      while (nested > 0 && ++end < tokens.length) {
        if (tokens[end].startsWith(`</${name}`)) nested--;
        else if (new RegExp(`^<${name}[\\s>]`).test(tokens[end]) && !tokens[end].endsWith('/>')) nested++;
      }
      if (nested > 0) return source;
      lines.push('  '.repeat(depth) + tokens.slice(index, end + 1).join(''));
      index = end;
    } else {
      lines.push('  '.repeat(depth++) + token);
    }
  }
  return depth === 0 ? lines.join('\n') : source;
}
