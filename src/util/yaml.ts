// A small YAML reader covering what Mermaid feeds to js-yaml with the JSON schema:
// block and flow collections, quoted and plain scalars, and block scalars.

export type YamlValue = null | boolean | number | string | YamlValue[] | { [key: string]: YamlValue };

class Reader {
  lines: string[];
  i = 0;

  constructor(src: string) {
    this.lines = src.replace(/\r\n?/g, '\n').split('\n');
  }

  skipBlank(): void {
    while (this.i < this.lines.length) {
      const t = this.lines[this.i].trim();
      if (t !== '' && t[0] !== '#' && t !== '---') break;
      this.i++;
    }
  }

  indent(): number {
    const line = this.lines[this.i];
    let k = 0;
    while (k < line.length && line[k] === ' ') k++;
    if (line[k] === '\t') throw new Error('YAML: tabs are not allowed for indentation');
    return k;
  }
}

const RE_INT = /^[-+]?(?:0|[1-9][0-9]*)$/;
const RE_HEX = /^[-+]?0x[0-9a-fA-F]+$/;
const RE_OCT = /^[-+]?0o[0-7]+$/;
const RE_BIN = /^[-+]?0b[01]+$/;
const RE_FLOAT = /^[-+]?(?:[0-9][0-9]*(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$/;
const RE_KEY = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s#:,[\]{}&*!|>'"%@`-][^:#]*?|-[^\s:#][^:#]*?)\s*:(?:\s+|$)/;

function scalar(raw: string): YamlValue {
  const s = raw.trim();
  if (s === '' || s === '~' || s === 'null' || s === 'Null' || s === 'NULL') return null;
  if (s === 'true' || s === 'True' || s === 'TRUE') return true;
  if (s === 'false' || s === 'False' || s === 'FALSE') return false;
  if (RE_INT.test(s) || RE_FLOAT.test(s)) return Number(s);
  if (RE_HEX.test(s) || RE_OCT.test(s) || RE_BIN.test(s)) {
    const neg = s[0] === '-';
    const v = Number(neg || s[0] === '+' ? s.slice(1) : s);
    return neg ? -v : v;
  }
  if (/^[-+]?\.(?:inf|Inf|INF)$/.test(s)) return s[0] === '-' ? -Infinity : Infinity;
  if (/^\.(?:nan|NaN|NAN)$/.test(s)) return NaN;
  return s;
}

const ESCAPES: Record<string, string> = {
  '0': '\0',
  a: '\x07',
  b: '\b',
  t: '\t',
  n: '\n',
  v: '\v',
  f: '\f',
  r: '\r',
  e: '\x1b',
  ' ': ' ',
  '"': '"',
  '/': '/',
  '\\': '\\',
  N: '\x85',
  _: '\xa0',
  L: '\u2028',
  P: '\u2029',
};

function fold(text: string): string {
  return text.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n+/g, (m) => (m.length === 1 ? ' ' : '\n'.repeat(m.length - 1)));
}

function unquoteDouble(body: string): string {
  let out = '';
  const s = fold(body.replace(/\\\n[ \t]*/g, ''));
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const e = s[++i];
    if (e === 'x' || e === 'u' || e === 'U') {
      const len = e === 'x' ? 2 : e === 'u' ? 4 : 8;
      out += String.fromCodePoint(parseInt(s.slice(i + 1, i + 1 + len), 16));
      i += len;
    } else if (e in ESCAPES) {
      out += ESCAPES[e];
    } else {
      throw new Error('YAML: unknown escape sequence');
    }
  }
  return out;
}

// Parses a flow value starting at s[pos]; returns the value and the index after it.
function flow(s: string, pos: number, stops: string): [YamlValue, number] {
  while (pos < s.length && /\s/.test(s[pos])) pos++;
  const ch = s[pos];
  if (ch === '{') {
    const out: { [key: string]: YamlValue } = {};
    pos++;
    while (true) {
      while (pos < s.length && /[\s,]/.test(s[pos])) pos++;
      if (pos >= s.length) throw new Error('YAML: unexpected end of the stream within a flow collection');
      if (s[pos] === '}') return [out, pos + 1];
      let key: YamlValue;
      [key, pos] = flow(s, pos, ':,}');
      while (pos < s.length && /\s/.test(s[pos])) pos++;
      let value: YamlValue = null;
      if (s[pos] === ':') [value, pos] = flow(s, pos + 1, ',}');
      out[String(key)] = value;
    }
  }
  if (ch === '[') {
    const out: YamlValue[] = [];
    pos++;
    while (true) {
      while (pos < s.length && /[\s,]/.test(s[pos])) pos++;
      if (pos >= s.length) throw new Error('YAML: unexpected end of the stream within a flow collection');
      if (s[pos] === ']') return [out, pos + 1];
      let value: YamlValue;
      [value, pos] = flow(s, pos, ',]');
      out.push(value);
    }
  }
  if (ch === '"') {
    let end = pos + 1;
    while (end < s.length && s[end] !== '"') end += s[end] === '\\' ? 2 : 1;
    if (end >= s.length) throw new Error('YAML: unexpected end of the stream within a double quoted scalar');
    return [unquoteDouble(s.slice(pos + 1, end)), end + 1];
  }
  if (ch === "'") {
    let end = pos + 1;
    while (end < s.length) {
      if (s[end] === "'") {
        if (s[end + 1] !== "'") break;
        end++;
      }
      end++;
    }
    if (end >= s.length) throw new Error('YAML: unexpected end of the stream within a single quoted scalar');
    return [fold(s.slice(pos + 1, end)).replace(/''/g, "'"), end + 1];
  }
  let end = pos;
  while (end < s.length) {
    const c = s[end];
    if (stops.includes(c) && (c !== ':' || end + 1 >= s.length || /[\s,[\]{}]/.test(s[end + 1]))) break;
    if (c === '#' && end > pos && /\s/.test(s[end - 1])) {
      const nl = s.indexOf('\n', end);
      s = s.slice(0, end) + (nl === -1 ? '' : s.slice(nl));
      continue;
    }
    end++;
  }
  return [scalar(fold(s.slice(pos, end).trim())), end];
}

function stripComment(s: string): string {
  let quote = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || s[i - 1] === ' ' || s[i - 1] === '\t')) {
      return s.slice(0, i);
    }
  }
  return s;
}

function blockScalar(r: Reader, header: string, parentIndent: number): string {
  const folded = header[0] === '>';
  const chomp = header.includes('-') ? '-' : header.includes('+') ? '+' : '';
  const explicit = /[1-9]/.exec(header);
  let indent = explicit ? parentIndent + Number(explicit[0]) : -1;
  const out: string[] = [];
  while (r.i < r.lines.length) {
    const line = r.lines[r.i];
    if (line.trim() === '') {
      out.push('');
      r.i++;
      continue;
    }
    const k = line.length - line.trimStart().length;
    if (indent === -1) {
      if (k <= parentIndent) break;
      indent = k;
    }
    if (k < indent) break;
    out.push(line.slice(indent));
    r.i++;
  }
  let trailing = 0;
  while (out.length > 0 && out[out.length - 1] === '') {
    out.pop();
    trailing++;
  }
  let text: string;
  if (folded) {
    text = '';
    for (let i = 0; i < out.length; i++) {
      const cur = out[i];
      if (i > 0) {
        const prev = out[i - 1];
        if (cur === '') text += '\n';
        else if (prev !== '') text += /^[ \t]/.test(prev) || /^[ \t]/.test(cur) ? '\n' : ' ';
      }
      text += cur;
    }
  } else {
    text = out.join('\n');
  }
  if (out.length === 0) return chomp === '+' ? '\n'.repeat(trailing) : '';
  if (chomp === '-') return text;
  if (chomp === '+') return text + '\n'.repeat(trailing + 1);
  return text + '\n';
}

function inlineValue(r: Reader, rest: string, indent: number): YamlValue {
  const first = rest[0];
  if (first === '|' || first === '>') {
    if (/^[|>][-+0-9]*\s*(?:#.*)?$/.test(rest)) return blockScalar(r, rest, indent);
  }
  if (first === '{' || first === '[' || first === '"' || first === "'") {
    let text = rest;
    const close = first === '{' ? '}' : first === '[' ? ']' : first;
    while (true) {
      try {
        const [value, end] = flow(text, 0, '');
        if (stripComment(text.slice(end)).trim() !== '') {
          throw new SyntaxError('YAML: unexpected content after a ' + (close === first ? 'quoted scalar' : 'flow collection'));
        }
        return value;
      } catch (err) {
        if (err instanceof SyntaxError || r.i >= r.lines.length) throw err;
        text += '\n' + r.lines[r.i++];
      }
    }
  }
  let text = stripComment(rest).trim();
  while (r.i < r.lines.length) {
    const line = r.lines[r.i];
    if (line.trim() === '') {
      let j = r.i;
      while (j < r.lines.length && r.lines[j].trim() === '') j++;
      if (j >= r.lines.length || r.lines[j].length - r.lines[j].trimStart().length <= indent) break;
      text += '\n'.repeat(j - r.i);
      r.i = j;
      continue;
    }
    if (line.length - line.trimStart().length <= indent) break;
    const more = stripComment(line).trim();
    text += (text.endsWith('\n') ? '' : ' ') + more;
    r.i++;
  }
  return scalar(text);
}

function block(r: Reader, minIndent: number): YamlValue {
  r.skipBlank();
  if (r.i >= r.lines.length) return null;
  const indent = r.indent();
  if (indent < minIndent) return null;
  const line = r.lines[r.i].slice(indent);

  if (line === '-' || line.startsWith('- ')) {
    const out: YamlValue[] = [];
    while (r.i < r.lines.length) {
      r.skipBlank();
      if (r.i >= r.lines.length || r.indent() !== indent) break;
      const cur = r.lines[r.i].slice(indent);
      if (cur !== '-' && !cur.startsWith('- ')) break;
      const rest = cur.slice(1);
      const pad = rest.length - rest.trimStart().length + 1;
      const body = stripComment(rest).trim();
      if (body === '') {
        r.i++;
        out.push(block(r, indent + 1));
      } else if (RE_KEY.test(body) && body[0] !== '{' && body[0] !== '[') {
        r.lines[r.i] = ' '.repeat(indent + pad) + rest.trimStart();
        out.push(block(r, indent + pad));
      } else {
        r.i++;
        out.push(inlineValue(r, rest.trim(), indent));
      }
    }
    return out;
  }

  const m = RE_KEY.exec(line);
  if (!m || line[0] === '{' || line[0] === '[') {
    r.i++;
    return inlineValue(r, line.trim(), indent - 1);
  }

  const out: { [key: string]: YamlValue } = {};
  while (r.i < r.lines.length) {
    r.skipBlank();
    if (r.i >= r.lines.length) break;
    const k = r.indent();
    if (k < indent) break;
    if (k > indent) throw new Error('YAML: bad indentation of a mapping entry');
    const cur = r.lines[r.i].slice(indent);
    const km = RE_KEY.exec(cur);
    if (!km) throw new Error('YAML: can not read a block mapping entry');
    const key = String(flow(km[1], 0, '')[0]);
    const rest = cur.slice(km[0].length);
    r.i++;
    if (stripComment(rest).trim() === '') {
      r.skipBlank();
      if (r.i < r.lines.length) {
        const next = r.indent();
        const nextLine = r.lines[r.i].slice(next);
        const seq = nextLine === '-' || nextLine.startsWith('- ');
        out[key] = next > indent || (seq && next === indent) ? block(r, seq ? indent : indent + 1) : null;
      } else {
        out[key] = null;
      }
    } else {
      out[key] = inlineValue(r, rest.trim(), indent);
    }
  }
  return out;
}

export function parseYaml(src: string): YamlValue {
  const r = new Reader(src);
  const value = block(r, 0);
  r.skipBlank();
  if (r.i < r.lines.length && r.lines[r.i].trim() !== '...') {
    throw new Error('YAML: end of the stream or a document separator is expected');
  }
  return value;
}
