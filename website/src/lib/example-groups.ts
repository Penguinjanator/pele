import { render } from 'pele';
import { exampleGroups, examplePages } from './examples';

const corpora = import.meta.glob<unknown>('../../../tests/corpus/*-docs.json', { eager: true, import: 'default' });

const draw = (source: string): string | undefined => {
  try {
    return render(source).svg;
  } catch {
    return undefined;
  }
};

export const groups = exampleGroups(corpora, draw);
export const pages = examplePages(corpora);
