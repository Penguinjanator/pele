import { resolve } from 'node:path';
import { tokenize } from '../../src/diagrams/gantt/lexer.js';
import { parseGantt, type GanttBuilder } from '../../src/diagrams/gantt/parser.js';
import { TOKEN_NAMES } from '../../src/diagrams/gantt/tokens.js';
import { createOracle, recordingYy, type Outcome, type Pair } from './oracle.js';

const oracle = createOracle(resolve('tests/compat/gantt/upstream/gantt.jison'));

export const lexerRules = (oracle.parser.lexer as unknown as { rules: RegExp[] }).rules;

// Match Pele: comments leave the preceding character intact.
{
  const comments = lexerRules.filter((rule) => rule.source === String.raw`^(?:[^\}]%%*[^\n]*)`);
  if (comments.length !== 1) throw new Error('Expected one Gantt preceding-character comment rule');
  lexerRules[lexerRules.indexOf(comments[0])] = /(?!)/;
}

export function oracleTokens(src: string): Pair[] {
  return oracle.tokens(src, {});
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
    parseGantt(src, yy as unknown as GanttBuilder);
    return { ok: true, calls };
  } catch (e) {
    return { ok: false, calls, error: String((e as Error).message) };
  }
}
