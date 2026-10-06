import { resolve } from 'node:path';
import { tokenize } from '../../src/diagrams/sequence/lexer.js';
import { parseSequence, type SeqBuilder } from '../../src/diagrams/sequence/parser.js';
import { TOKEN_NAMES } from '../../src/diagrams/sequence/tokens.js';
import { createOracle, recordingYy, type Outcome, type Pair } from './oracle.js';
import { LINETYPE, PLACEMENT } from './sequence-constants.js';

const oracle = createOracle(resolve('tests/compat/sequence/upstream/sequenceDiagram.jison'));

// The grammar puts the return values of these two into the statement list it hands to `apply`,
// so the recorder returns something that shows which text each was called with.
function recorder() {
  const rec = recordingYy(oracle.methods, {
    parseMessage: (str: string) => ({ message: str }),
    parseBoxData: (str: string) => ({ box: str }),
  });
  rec.yy.LINETYPE = LINETYPE;
  rec.yy.PLACEMENT = PLACEMENT;
  return rec;
}

export function oracleTokens(src: string): Pair[] {
  return oracle.tokens(src, recorder().yy);
}

export function peleTokens(src: string): Pair[] {
  const { types, texts } = tokenize(src);
  return types.map((t, i) => [TOKEN_NAMES[t], texts[i]] as Pair);
}

// The grammar keeps changing the statement lists after it has built them, so the calls are
// compared as they stand once parsing is over.
const snapshot = (calls: unknown[][]): unknown[][] => JSON.parse(JSON.stringify(calls)) as unknown[][];

export function oracleParse(src: string): Outcome {
  const { yy, calls } = recorder();
  const result = oracle.parse(src, yy);
  return { ok: result.ok, calls: snapshot(calls), error: result.error };
}

export function peleParse(src: string): Outcome {
  const { yy, calls } = recorder();
  try {
    parseSequence(src, yy as unknown as SeqBuilder);
    return { ok: true, calls: snapshot(calls) };
  } catch (e) {
    return { ok: false, calls: snapshot(calls), error: String((e as Error).message) };
  }
}
