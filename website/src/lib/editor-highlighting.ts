import { maxHighlightLineLength } from './playground-limits';
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { Tag } from '@lezer/highlight';
import { createHighlightState, highlightLine, type CodeLanguage, type HighlightState } from './highlight';

interface HighlightRange { from: number; to: number; className: string | null }

// Adapt the static highlighter's escaped spans to editor ranges. Keeping a
// single token source keeps the docs and the editors in the same colors.
export function editorHighlightRanges(line: string, language: CodeLanguage, state: HighlightState): HighlightRange[] {
  if (line.length > maxHighlightLineLength) return [{ from: 0, to: line.length, className: null }];
  const html = highlightLine(line, language, state);
  const classes: string[] = [];
  const ranges: HighlightRange[] = [];
  const entities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
  let offset = 0;
  for (const match of html.matchAll(/<span class="([\w-]+)">|<\/span>|([^<]+)/g)) {
    if (match[1]) classes.push(match[1]);
    else if (match[2]) {
      const text = match[2].replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => entities[entity]);
      ranges.push({ from: offset, to: offset + text.length, className: classes.at(-1) ?? null });
      offset += text.length;
    } else classes.pop();
  }
  return ranges;
}

const tokenTable = Object.fromEntries([
  'syn-language', 'syn-type', 'syn-selector', 'syn-punctuation', 'syn-string', 'syn-number', 'syn-import',
  'syn-constant', 'syn-keyword', 'syn-variable', 'syn-function', 'syn-command',
  'syn-yaml-key', 'syn-comment', 'syn-tag',
].map((name) => [name, Tag.define()]));

export const editorHighlightStyle = HighlightStyle.define(
  Object.entries(tokenTable).map(([className, tag]) => ({ tag, class: className })),
);

export function editorLanguage(language: CodeLanguage) {
  return StreamLanguage.define({
    startState: () => ({ ...createHighlightState(), ranges: [] as HighlightRange[], index: 0 }),
    token(stream, state) {
      if (stream.sol()) {
        state.ranges = editorHighlightRanges(stream.string, language, state);
        state.index = 0;
      }
      const range = state.ranges[state.index++];
      if (!range) { stream.skipToEnd(); return null; }
      stream.pos = range.to;
      return range.className;
    },
    tokenTable,
  });
}

export const editorHighlighting = (language: CodeLanguage): Extension[] => [
  editorLanguage(language), syntaxHighlighting(editorHighlightStyle),
];
