export type Visibility = '#' | '+' | '~' | '-' | '';

function tildes(text: string): number {
  let count = 0;
  for (let i = text.indexOf('~'); i !== -1; i = text.indexOf('~', i + 1)) count++;
  return count;
}

// Pairs tildes from the outside in: the first with the last, the second with the one before it.
function pairTildes(text: string): string {
  const count = tildes(text);
  if (count <= 1) return text;
  const lead = count % 2 !== 0 && text.startsWith('~');
  const chars = text.split('');
  const at: number[] = [];
  for (let i = lead ? 1 : 0; i < chars.length; i++) if (chars[i] === '~') at.push(i);
  for (let lo = 0, hi = at.length - 1; lo < hi; lo++, hi--) {
    chars[at[lo]] = '<';
    chars[at[hi]] = '>';
  }
  return chars.join('');
}

// Turns `List~int~` into `List<int>`, with the quirks of Mermaid's parseGenericTypes around commas.
export function parseGenericTypes(input: string): string {
  if (!input.includes('~')) return input;
  const sets = input.split(/(,)/);
  const output: string[] = [];
  for (let i = 0; i < sets.length; i++) {
    let set = sets[i];
    if (set === ',' && i > 0 && i + 1 < sets.length && tildes(sets[i - 1]) === 1 && tildes(sets[i + 1]) === 1) {
      set = sets[i - 1] + ',' + sets[i + 1];
      i++;
      output.pop();
    }
    output.push(pairTildes(set));
  }
  return output.join('');
}

function isLineEnd(c: number): boolean {
  return c === 10 || c === 13 || c === 0x2028 || c === 0x2029;
}

function isVisibility(ch: string): ch is Visibility {
  return ch === '#' || ch === '+' || ch === '~' || ch === '-';
}

export class ClassMember {
  id = '';
  memberType: 'method' | 'attribute';
  visibility: Visibility = '';
  classifier = '';
  parameters = '';
  returnType = '';

  constructor(input: string, memberType: 'method' | 'attribute') {
    this.memberType = memberType;
    // Mermaid throws a TypeError for a method with no opening parenthesis, such as `run)`.
    // It is kept here as an attribute, so it is shown as written.
    if (memberType !== 'method' || !this.parseMethod(input)) this.parseAttribute(input);
    this.id = this.id.startsWith(' ') ? ' ' + this.id.trim() : this.id.trim();
  }

  // The same split as Mermaid's /([#+~-])?(.+)\((.*)\)([\s$*])?(.*)([$*])?/, found in one pass:
  // the first line with an opening parenthesis after its first character and a closing one later.
  private parseMethod(input: string): boolean {
    const n = input.length;
    for (let start = 0; start < n; ) {
      let end = start;
      while (end < n && !isLineEnd(input.charCodeAt(end))) end++;
      let close = end - 1;
      while (close > start && input.charCodeAt(close) !== 41) close--;
      let open = close - 1;
      while (open > start && input.charCodeAt(open) !== 40) open--;
      if (open > start) {
        const first = input[start];
        const visible = isVisibility(first) && open > start + 1;
        if (visible) this.visibility = first;
        this.id = input.slice(visible ? start + 1 : start, open);
        this.parameters = input.slice(open + 1, close).trim();
        let rest = close + 1;
        let classifier = '';
        if (rest < n) {
          const next = input[rest];
          if (next === '$' || next === '*' || next.trim() === '') {
            classifier = next.trim();
            rest++;
          }
        }
        let stop = rest;
        while (stop < n && !isLineEnd(input.charCodeAt(stop))) stop++;
        this.returnType = input.slice(rest, stop).trim();
        if (classifier === '') {
          const last = this.returnType.slice(-1);
          if (last === '$' || last === '*') {
            classifier = last;
            this.returnType = this.returnType.slice(0, -1);
          }
        }
        this.classifier = classifier;
        return true;
      }
      start = end + 1;
    }
    this.memberType = 'attribute';
    return false;
  }

  private parseAttribute(input: string): void {
    const first = input.slice(0, 1);
    const last = input.slice(-1);
    if (isVisibility(first)) this.visibility = first;
    if (last === '$' || last === '*') this.classifier = last;
    this.id = input.substring(this.visibility === '' ? 0 : 1, this.classifier === '' ? input.length : input.length - 1);
  }

  getDisplayDetails(): { displayText: string; cssStyle: string } {
    let displayText = this.visibility + parseGenericTypes(this.id);
    if (this.memberType === 'method') {
      displayText += `(${parseGenericTypes(this.parameters.trim())})`;
      if (this.returnType) displayText += ' : ' + parseGenericTypes(this.returnType);
    }
    return { displayText: displayText.trim(), cssStyle: this.parseClassifier() };
  }

  parseClassifier(): string {
    return this.classifier === '*' ? 'font-style:italic;' : this.classifier === '$' ? 'text-decoration:underline;' : '';
  }
}
