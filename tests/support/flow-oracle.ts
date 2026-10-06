import { resolve } from 'node:path';
import { tokenize } from '../../src/diagrams/flowchart/lexer.js';
import { parseFlowchart } from '../../src/diagrams/flowchart/parser.js';
import { TOKEN_NAMES } from '../../src/diagrams/flowchart/tokens.js';
import type { FlowDb } from '../../src/diagrams/flowchart/db.js';
import { buildParser } from './jison.js';

const oracle = buildParser(resolve('tests/compat/flowchart/upstream/flow.jison'));

const METHODS = [
  'setDirection',
  'addVertex',
  'addLink',
  'addSubGraph',
  'setClass',
  'addClass',
  'setClickEvent',
  'setTooltip',
  'setLink',
  'updateLink',
  'updateLinkInterpolate',
  'setAccTitle',
  'setAccDescription',
];

type Call = unknown[];

function recorder(): { yy: Record<string, unknown>; calls: Call[] } {
  const calls: Call[] = [];
  let first = true;
  const yy: Record<string, unknown> = {
    lex: {
      firstGraph: () => {
        if (first) {
          first = false;
          return true;
        }
        return false;
      },
    },
    destructLink: (end: string, start?: string) => ({ type: `${start ?? ''}|${end}`, stroke: 's', length: 1 }),
  };
  for (const name of METHODS) {
    yy[name] = (...args: unknown[]) => {
      while (args.length > 0 && args[args.length - 1] === undefined) args.pop();
      calls.push([name, ...args]);
      return name === 'addSubGraph' ? 'SG' + calls.length : undefined;
    };
  }
  return { yy, calls };
}

export function prepare(src: string): string {
  return src.replace(/}\s*\n/g, '}\n');
}

export type Pair = [string, string];

function merge(tokens: Pair[]): Pair[] {
  const out: Pair[] = [];
  for (const t of tokens) {
    const last = out[out.length - 1];
    if (last && last[0] === t[0] && (t[0] === 'TEXT' || t[0] === 'EDGE_TEXT')) last[1] += t[1];
    else out.push([t[0], t[1]]);
  }
  return out;
}

export function oracleTokens(src: string): Pair[] {
  const lexer = Object.create(oracle.lexer) as JisonParser['lexer'];
  lexer.setInput(prepare(src), recorder().yy);
  const out: Pair[] = [];
  for (let i = 0; i < 1e6; i++) {
    let t: number;
    try {
      t = lexer.lex();
    } catch {
      out.push(['INVALID', '']);
      break;
    }
    if (t === 1) {
      out.push(['$end', '']);
      break;
    }
    out.push([oracle.terminals_[t] ?? String(t), lexer.yytext]);
  }
  return merge(out);
}

type JisonParser = ReturnType<typeof buildParser>;

export function peleTokens(src: string): Pair[] {
  const { types, texts } = tokenize(prepare(src));
  return merge(types.map((t, i) => [TOKEN_NAMES[t], texts[i]] as Pair));
}

export interface Outcome {
  ok: boolean;
  calls: Call[];
  error?: string;
}

export function oracleParse(src: string): Outcome {
  const { yy, calls } = recorder();
  oracle.yy = yy;
  try {
    oracle.parse(prepare(src));
    return { ok: true, calls };
  } catch (e) {
    return { ok: false, calls, error: String((e as Error).message) };
  }
}

export function peleParse(src: string): Outcome {
  const { yy, calls } = recorder();
  try {
    parseFlowchart(src, yy as unknown as FlowDb);
    return { ok: true, calls };
  } catch (e) {
    return { ok: false, calls, error: String((e as Error).message) };
  }
}
