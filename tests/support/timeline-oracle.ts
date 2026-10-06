import { resolve } from 'node:path';
import type { TimelineDb } from '../../src/diagrams/timeline/db.js';
import { TOKEN_NAMES, tokenize } from '../../src/diagrams/timeline/lexer.js';
import { parseTimeline } from '../../src/diagrams/timeline/parser.js';
import { createOracle, recordingYy, type Outcome, type Pair } from './oracle.js';

export const oracle = createOracle(resolve('tests/compat/timeline/upstream/timeline.jison'));

// The grammar reaches the title and accessibility setters through getCommonDb(); record those calls too.
function recorder() {
  const rec = recordingYy([...oracle.methods, 'setDiagramTitle', 'setAccTitle', 'setAccDescription'], {
    getCommonDb: () => rec.yy,
  });
  return rec;
}

export function oracleTokens(src: string): Pair[] {
  return oracle.tokens(src, recorder().yy);
}

export function peleTokens(src: string): Pair[] {
  const { types, texts } = tokenize(src);
  return types.map((t, i) => [TOKEN_NAMES[t], texts[i]] as Pair);
}

export function oracleParse(src: string): Outcome {
  const { yy, calls } = recorder();
  const result = oracle.parse(src, yy);
  return { ok: result.ok, calls, error: result.error };
}

export function peleParse(src: string): Outcome {
  const { yy, calls } = recorder();
  try {
    parseTimeline(src, yy as unknown as TimelineDb);
    return { ok: true, calls };
  } catch (e) {
    return { ok: false, calls, error: String((e as Error).message) };
  }
}
