export const siteDescription = 'Pele renders Mermaid diagrams to SVG. It is small, synchronous, and themed with CSS custom properties.';
export const repositoryUrl = 'https://github.com/kepano/pele';
export const packageName = '@kepano/pele';

export const docsPages = [
  { id: 'introduction', title: 'Introduction' },
  { id: 'api', title: 'API' },
  { id: 'theming', title: 'Theming' },
  { id: 'compatibility', title: 'Compatibility' },
] as const;

export type DocsPageId = typeof docsPages[number]['id'];

// The introduction is the home page; every other page has a Markdown source.
export const pageHref = (id: DocsPageId): string => (id === 'introduction' ? '/' : `/${id}`);

export interface Heading {
  depth: number;
  slug: string;
  text: string;
}
