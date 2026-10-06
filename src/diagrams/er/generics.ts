function tildes(text: string): number {
  let count = 0;
  for (let i = text.indexOf('~'); i !== -1; i = text.indexOf('~', i + 1)) count++;
  return count;
}

// Pairs tildes from the outside in: the first with the last, the second with the one before it.
function pair(input: string): string {
  const count = tildes(input);
  if (count <= 1) return input;
  const lead = count % 2 !== 0 && input.startsWith('~');
  const chars = (lead ? input.slice(1) : input).split('');
  let first = chars.indexOf('~');
  let last = chars.lastIndexOf('~');
  while (first !== -1 && first < last) {
    chars[first] = '<';
    chars[last] = '>';
    first = chars.indexOf('~', first + 1);
    last = chars.lastIndexOf('~', last - 1);
  }
  return (lead ? '~' : '') + chars.join('');
}

// Mermaid's parseGenericTypes: `List~int~` reads as `List<int>` and `Map~K,V~` as `Map<K,V>`.
export function genericTypes(input: string): string {
  if (!input.includes('~')) return input;
  const sets = input.split(/(,)/);
  const out: string[] = [];
  for (let i = 0; i < sets.length; i++) {
    let set = sets[i];
    if (set === ',' && i > 0 && i + 1 < sets.length && tildes(sets[i - 1]) === 1 && tildes(sets[i + 1]) === 1) {
      set = sets[i - 1] + ',' + sets[i + 1];
      i++;
      out.pop();
    }
    out.push(pair(set));
  }
  return out.join('');
}
