import { playgroundLimits, playgroundSizeError } from './playground-limits';

export function playgroundHref(source: string, css = ''): string {
  if (source.length > playgroundLimits.source) throw new Error(playgroundSizeError('Source'));
  if (css.length > playgroundLimits.source) throw new Error(playgroundSizeError('CSS'));
  const params = new URLSearchParams({ source });
  if (css) params.set('css', css);
  if (params.toString().length + 1 > playgroundLimits.hash) throw new Error('This diagram is too large to share.');
  return `/playground#${params}`;
}

export function readPlaygroundLink(hash: string): { source: string; css: string } | null {
  if (!hash.startsWith('#') || hash.length > playgroundLimits.hash) return null;
  const params = new URLSearchParams(hash.slice(1));
  const source = params.get('source');
  const css = params.get('css') ?? '';
  return source !== null && source.length <= playgroundLimits.source && css.length <= playgroundLimits.source ? { source, css } : null;
}
