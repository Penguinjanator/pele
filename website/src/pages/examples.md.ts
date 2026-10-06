import type { APIRoute } from 'astro';
import { groups } from '../lib/example-groups';
import { examplesDescription, examplesTitle } from '../lib/examples';
import { formatPageTitle } from '../lib/page-title';

const body = groups.map((group) =>
  `## ${group.title}\n\n` + group.sources.map((source) => '```mermaid\n' + source.trimEnd() + '\n```\n').join('\n'),
).join('\n');

export const GET: APIRoute = () => new Response(
  `---\ntitle: ${formatPageTitle(examplesTitle)}\ndescription: ${examplesDescription}\n---\n\n${body}`,
  { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } },
);
