import { resolve } from 'node:path';
import type { JourneyDb } from '../../src/diagrams/journey/db.js';
import { TOKEN_NAMES, tokenize } from '../../src/diagrams/journey/lexer.js';
import { parseJourney } from '../../src/diagrams/journey/parser.js';
import { createOracle, recordingYy, type Outcome, type Pair } from './oracle.js';

export const oracle = createOracle(resolve('tests/compat/journey/upstream/journey.jison'));

export function oracleTokens(src: string): Pair[] {
  return oracle.tokens(src, recordingYy(oracle.methods).yy);
}

export function peleTokens(src: string): Pair[] {
  const { types, texts } = tokenize(src);
  return types.map((t, i) => [TOKEN_NAMES[t], texts[i]] as Pair);
}

export function oracleParse(src: string): Outcome {
  const { yy, calls } = recordingYy(oracle.methods);
  const result = oracle.parse(src, yy);
  return { ok: result.ok, calls, error: result.error };
}

export function peleParse(src: string): Outcome {
  const { yy, calls } = recordingYy(oracle.methods);
  try {
    parseJourney(src, yy as unknown as JourneyDb);
    return { ok: true, calls };
  } catch (e) {
    return { ok: false, calls, error: String((e as Error).message) };
  }
}
