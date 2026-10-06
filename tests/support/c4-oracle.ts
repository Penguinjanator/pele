import { resolve } from 'node:path';
import type { C4Db } from '../../src/diagrams/c4/db.js';
import { tokenize } from '../../src/diagrams/c4/lexer.js';
import { parseC4 } from '../../src/diagrams/c4/parser.js';
import { TOKEN_NAMES } from '../../src/diagrams/c4/tokens.js';
import { createOracle, recordingYy, type Call, type Outcome, type Pair } from './oracle.js';

export const oracle = createOracle(resolve('tests/compat/c4/upstream/c4Diagram.jison'));

export function oracleTokens(src: string): Pair[] {
  return oracle.tokens(src, recordingYy(oracle.methods).yy);
}

export function peleTokens(src: string): Pair[] {
  const { types, starts, ends } = tokenize(src);
  return types.map((t, i) => [TOKEN_NAMES[t], src.slice(starts[i], ends[i])] as Pair);
}

export function oracleParse(src: string): Outcome {
  const { yy, calls } = recordingYy(oracle.methods);
  const result = oracle.parse(src, yy);
  return { ok: result.ok, calls, error: result.error };
}

// The grammar spreads the argument list into each call and builds a one-key object for a named
// argument. Pele passes the list as an array of strings and { key, value } pairs; this puts its
// calls in the grammar's form. The assignment mirrors the grammar's `kv[key] = value`.
function spread(call: Call): Call {
  const out: Call = [];
  for (const arg of call) {
    if (!Array.isArray(arg)) {
      out.push(arg);
      continue;
    }
    for (const attr of arg as (string | { key: string; value: string })[]) {
      if (typeof attr === 'string') {
        out.push(attr);
      } else {
        const kv: Record<string, string> = {};
        kv[attr.key] = attr.value;
        out.push(kv);
      }
    }
  }
  return out;
}

export function peleParse(src: string): Outcome {
  const { yy, calls } = recordingYy(oracle.methods);
  try {
    parseC4(src, yy as unknown as C4Db);
    return { ok: true, calls: calls.map(spread) };
  } catch (e) {
    return { ok: false, calls: calls.map(spread), error: String((e as Error).message) };
  }
}
