import { render } from 'pele';
import { exampleGroups } from './examples';

const corpora = import.meta.glob<unknown>('../../../tests/corpus/*-docs.json', { eager: true, import: 'default' });

const renders = (source: string): boolean => {
  try {
    render(source);
    return true;
  } catch {
    return false;
  }
};

export const groups = exampleGroups(corpora, renders);
