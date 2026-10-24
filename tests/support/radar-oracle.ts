import { RadarModule } from '@mermaid-js/parser';

interface ReferenceToken {
  name: string;
  PATTERN: unknown;
}

interface Builder {
  buildTokens(...args: unknown[]): ReferenceToken[];
}

type Matched = { tokenType: { name: string } }[];

function find(tokens: ReferenceToken[], name: string, source: string): ReferenceToken & { PATTERN: RegExp } {
  const matches = tokens.filter((t) => t.name === name && t.PATTERN instanceof RegExp && t.PATTERN.source === source);
  if (matches.length !== 1) throw new Error(`Expected one radar ${name} token`);
  return matches[0] as ReferenceToken & { PATTERN: RegExp };
}

// Match Pele: allow longer names and preserve glued option values.
function patch(tokens: ReferenceToken[]): void {
  const rest = /[-\w]*\w/y;
  for (const [name, option, source] of [
    ['GRATICULE', 'graticule', 'circle|polygon'],
    ['BOOLEAN', 'showLegend', 'true|false'],
  ]) {
    const token = find(tokens, name, source);
    const pattern = new RegExp(source, 'y');
    token.PATTERN = {
      source,
      exec(text: string, offset: number, matched: Matched): RegExpExecArray | null {
        pattern.lastIndex = offset;
        const m = pattern.exec(text);
        if (m === null || matched.at(-1)?.tokenType.name === option) return m;
        rest.lastIndex = offset + m[0].length;
        return rest.test(text) ? null : m;
      },
    };
  }
  const title = find(tokens, 'TITLE', String.raw`[\t ]*title(?:[\t ][^\n\r]*?(?=%%)|[\t ][^\n\r]*|)`);
  title.PATTERN = new RegExp(title.PATTERN.source.replace(/\|\)$/, String.raw`|(?![-\w]*\w))`), title.PATTERN.flags);
}

const parser = (RadarModule as unknown as { parser: { TokenBuilder: () => Builder } }).parser;
const create = parser.TokenBuilder;
parser.TokenBuilder = () => {
  const builder = create();
  const build = builder.buildTokens.bind(builder);
  builder.buildTokens = (...args) => {
    const tokens = build(...args);
    patch(tokens);
    return tokens;
  };
  return builder;
};
