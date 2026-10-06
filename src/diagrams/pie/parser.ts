import {
  ACC_DESCR,
  ACC_TITLE,
  DIRECTIVE,
  NEWLINE,
  Reader,
  SINGLE_LINE_COMMENT,
  STRING,
  TITLE,
  WHITESPACE,
  YAML,
  accDescrValue,
  accTitleValue,
  keyword,
  stringValue,
  titleValue,
  tokenize,
  type TokenType,
} from '../common/tokens.js';

const enum T {
  showData,
  pie,
  colon,
  number,
  accDescr,
  accTitle,
  title,
  string,
  newline,
}

export const PIE_TOKENS: readonly TokenType[] = [
  keyword('showData'),
  keyword('pie'),
  { name: ':', pattern: ':' },
  { name: 'NUMBER_PIE', pattern: /(?:-?[0-9]+\.[0-9]+(?!\.))|(?:-?(0|[1-9][0-9]*)(?!\.))/y },
  ACC_DESCR,
  ACC_TITLE,
  TITLE,
  STRING,
  NEWLINE,
  WHITESPACE,
  YAML,
  DIRECTIVE,
  SINGLE_LINE_COMMENT,
];

export interface PieAst {
  $type: 'Pie';
  showData: boolean;
  title?: string;
  accTitle?: string;
  accDescr?: string;
  sections: { $type: 'PieSection'; label: string; value: number }[];
}

export function parsePie(src: string): PieAst {
  const r = new Reader(tokenize(src, PIE_TOKENS, 'pie'), PIE_TOKENS, 'pie');
  const ast: PieAst = { $type: 'Pie', showData: false, sections: [] };

  const endOfLine = (): void => {
    if (r.kind === -1) return;
    if (r.kind !== T.newline) r.fail("a line break or the end of input");
    while (r.kind === T.newline) r.i++;
  };

  while (r.kind === T.newline) r.i++;
  r.expect(T.pie);
  ast.showData = r.accept(T.showData);
  while (r.kind !== -1) {
    switch (r.kind) {
      case T.newline:
        r.i++;
        break;
      case T.accDescr:
        ast.accDescr = accDescrValue(r.take());
        endOfLine();
        break;
      case T.accTitle:
        ast.accTitle = accTitleValue(r.take());
        endOfLine();
        break;
      case T.title:
        ast.title = titleValue(r.take());
        endOfLine();
        break;
      case T.string: {
        const label = stringValue(r.take());
        r.expect(T.colon);
        const value = Number(r.expect(T.number));
        ast.sections.push({ $type: 'PieSection', label, value });
        endOfLine();
        break;
      }
      default:
        r.fail("a section, a title, or a line break");
    }
  }
  return ast;
}
