import { playgroundLimits, playgroundSizeError } from './playground-limits';

export function playgroundHref(source: string): string {
  if (source.length > playgroundLimits.source) throw new Error(playgroundSizeError);
  const params = new URLSearchParams({ source });
  if (params.toString().length + 1 > playgroundLimits.hash) throw new Error('This diagram is too large to share.');
  return `/playground#${params}`;
}

export function readPlaygroundSource(hash: string): string | null {
  if (!hash.startsWith('#') || hash.length > playgroundLimits.hash) return null;
  const source = new URLSearchParams(hash.slice(1)).get('source');
  return source !== null && source.length <= playgroundLimits.source ? source : null;
}
