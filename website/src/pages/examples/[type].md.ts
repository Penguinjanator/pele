import type { APIRoute } from 'astro';
import { pages } from '../../lib/example-groups';
import type { ExamplePage } from '../../lib/examples';
import { formatPageTitle } from '../../lib/page-title';

export const getStaticPaths = () => pages.map((page) => ({ params: { type: page.type }, props: page }));

const fenced = (source: string): string => '```mermaid\n' + source.trimEnd() + '\n```\n';

export const GET: APIRoute = ({ props }) => {
  const page = props as ExamplePage;
  const groups = page.groups.map((group) =>
    `## ${group.title}\n\n` + group.cases.map((item) => `### ${item.title}\n\n${item.note ? `${item.note}\n\n` : ''}${fenced(item.source)}`).join('\n'),
  );
  const documentation = (page.groups.length > 0 ? '## Documentation examples\n\n' : '') + page.sources.map(fenced).join('\n');
  return new Response(
    `---\ntitle: ${formatPageTitle(page.title)}\ndescription: ${page.description}\n---\n\n${[...groups, documentation].join('\n')}`,
    { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } },
  );
};
