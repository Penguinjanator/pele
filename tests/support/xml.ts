// Checks that a string is well-formed XML: balanced tags, quoted attributes, escaped text.
export function assertWellFormed(xml: string): void {
  const stack: string[] = [];
  const re = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>/y;
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    const text = xml.slice(i, lt === -1 ? xml.length : lt);
    if (text.includes('>')) throw new Error(`Unescaped ">" in text near ${JSON.stringify(text.slice(0, 40))}`);
    if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(text)) {
      throw new Error(`Unescaped "&" in text near ${JSON.stringify(text.slice(0, 40))}`);
    }
    if (lt === -1) break;
    re.lastIndex = lt;
    const m = re.exec(xml);
    if (!m) throw new Error(`Malformed tag at ${lt}: ${JSON.stringify(xml.slice(lt, lt + 60))}`);
    const [, closing, name, attrs, selfClosing] = m;
    if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(attrs)) {
      throw new Error(`Unescaped "&" in attributes of <${name}>`);
    }
    if (closing) {
      const open = stack.pop();
      if (open !== name) throw new Error(`</${name}> closes <${open}>`);
    } else if (!selfClosing) {
      stack.push(name);
    }
    i = re.lastIndex;
  }
  if (stack.length > 0) throw new Error(`Unclosed <${stack[stack.length - 1]}>`);
}
