export const siteDescription = 'Pele is a lightweight library that renders Mermaid diagrams to SVG, themed with CSS variables.';
export const repositoryUrl = 'https://github.com/kepano/pele';
export const packageName = 'pele';

export const docsPages = [
  { id: 'introduction', title: 'Introduction' },
  { id: 'examples', title: 'Examples' },
  { id: 'api', title: 'API' },
  { id: 'theming', title: 'Theming' },
  { id: 'compatibility', title: 'Compatibility' },
  { id: 'security', title: 'Security' },
] as const;

export type DocsPageId = typeof docsPages[number]['id'];

// The introduction is the home page and the examples are generated; the other pages have a Markdown source.
export const pageHref = (id: DocsPageId): string => (id === 'introduction' ? '/' : `/${id}`);

export interface Heading {
  depth: number;
  slug: string;
  text: string;
}
