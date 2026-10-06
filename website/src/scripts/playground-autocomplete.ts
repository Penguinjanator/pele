import { detectType } from 'pele';
import { autocompletion, completionKeymap, acceptCompletion } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { mermaidCompletions } from '../lib/playground-completions';

const typeOf = (source: string) => {
  try {
    return detectType(source);
  } catch {
    return null;
  }
};

export const mermaidAutocomplete = (): Extension => [
  autocompletion({
    icons: false,
    optionClass: (completion) => `playground-completion-${completion.type}`,
    activateOnTypingDelay: 80,
    override: [(context) => {
      const source = context.state.doc.toString();
      const found = mermaidCompletions(source, context.pos, typeOf(source), context.explicit);
      return found && { ...found, validFor: /^[\w-]*$/ };
    }],
  }),
  keymap.of([...completionKeymap, { key: 'Tab', run: acceptCompletion }]),
];
