import { docs } from './docs';
import { pages as examplePages } from './example-groups';
import { examplePageHref, examplesDescription, examplesTitle } from './examples';
import type { SearchItem } from './search';

const plainText = (value: string) => value
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
  .replace(/\\\|/g, '|')
  .replace(/[`*]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
const excerpt = (value: string) => value.length > 180 ? `${value.slice(0, 177).replace(/\s+\S*$/, '')}…` : value;
const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((cell) => cell.trim());

interface Section {
  lines: string[];
}

// Sections are split from the Markdown source and paired, in order, with the
// slugs Astro generated, so every result links to an anchor that exists.
function sections(source: string): Section[] {
  const result: Section[] = [];
  let fenced = false;
  for (const line of source.replace(/^---[\s\S]*?\n---\n/, '').split('\n')) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (!fenced && /^#{2,3}\s/.test(line)) result.push({ lines: [] });
    else if (!fenced && !/^\s*```/.test(line)) result.at(-1)?.lines.push(line);
  }
  return result;
}

export function buildSearchIndex(): SearchItem[] {
  const pages: SearchItem[] = [];
  const entries: SearchItem[] = [];
  for (const doc of docs) {
    const { frontmatter, getHeadings } = doc.module;
    pages.push({ title: frontmatter.title, kind: 'page', category: 'Docs', summary: frontmatter.description, href: `/${doc.id}` });
    const headings = getHeadings().filter((heading) => heading.depth === 2 || heading.depth === 3);
    sections(doc.source).forEach((section, index) => {
      const heading = headings[index];
      if (!heading) return;
      const href = `/${doc.id}#${heading.slug}`;
      const paragraph = section.lines.find((line) => line.trim() && !/^\s*(?:\||[-*] |\d+\. |>)/.test(line));
      entries.push({
        title: heading.text,
        kind: 'section',
        category: frontmatter.title,
        summary: excerpt(plainText(paragraph ?? '') || `${frontmatter.title} reference for ${heading.text}.`),
        href,
        searchTerms: [plainText(section.lines.join(' '))],
      });
      const rows = section.lines.filter((line) => /^\s*\|/.test(line) && !/^\s*\|[\s:|-]+\|\s*$/.test(line)).slice(1);
      for (const row of rows) {
        const columns = cells(row);
        if (columns.length < 2 || !columns[0].startsWith('`')) continue;
        entries.push({
          title: plainText(columns[0]),
          kind: 'field',
          category: heading.text,
          summary: `${heading.text} · ${plainText(columns.at(-1)!)}`,
          href,
          searchTerms: columns.slice(1).map(plainText),
        });
      }
    });
  }
  pages.unshift({ title: 'Introduction', kind: 'page', category: 'Docs', summary: 'What Pele is, how it works, and how to add it to your app.', href: '/' });
  pages.splice(1, 0, { title: examplesTitle, kind: 'page', category: 'Docs', summary: examplesDescription, href: '/examples' });
  // Each diagram type's own page of examples. They follow the documentation's sections, so that
  // the list shown before anything is typed stays as it was.
  for (const page of examplePages) {
    entries.push({
      title: page.title,
      kind: 'page',
      category: examplesTitle,
      summary: page.description,
      href: examplePageHref(page.type),
      searchTerms: [page.type, 'diagram', 'chart'],
    });
  }
  return [
    ...pages,
    { title: 'Playground', kind: 'page', category: 'Tool', summary: 'Render Mermaid source with Pele and compare it with Mermaid.', href: '/playground' },
    ...entries,
  ];
}
