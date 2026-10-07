import type { APIRoute } from 'astro';
import { pages } from '../lib/example-groups';
import { examplePageHref } from '../lib/examples';
import { docsPages, pageHref } from '../lib/site';

export const GET: APIRoute = ({ site }) => {
  const routes = [...docsPages.map(({ id }) => pageHref(id)), ...pages.map(({ type }) => examplePageHref(type)), '/playground'];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map((route) => `<url><loc>${new URL(route, site)}</loc></url>`).join('')}</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
