import { lucideIcons } from './lucide-icons';

// Names from other icon sets, for the Lucide icon that stands in for them.
const aliases: Readonly<Record<string, string>> = {
  spinner: 'loader', twitter: 'bird', home: 'house', cog: 'settings', gear: 'settings', times: 'x', close: 'x',
  edit: 'pencil', envelope: 'mail', trash: 'trash-2', warning: 'triangle-alert', 'exclamation-triangle': 'triangle-alert',
  'check-circle': 'circle-check', question: 'circle-question-mark', 'question-circle': 'circle-question-mark',
  'user-circle': 'circle-user', 'info-circle': 'info', bolt: 'zap', comment: 'message-circle', bars: 'menu',
  'map-marker': 'map-pin', refresh: 'refresh-cw', sync: 'refresh-cw', 'bar-chart': 'chart-bar', 'pie-chart': 'chart-pie',
  mobile: 'smartphone', 'file-alt': 'file-text', 'lightbulb-o': 'lightbulb', cube: 'box', microchip: 'cpu', hdd: 'hard-drive',
};

// The site's icons for diagrams: a Lucide icon for a name such as `fa:fa-car`, `fa fa-book`, or
// `mdi mdi-skull-outline`. A name it does not know gets none, and the diagram is drawn without it.
export function siteIcon(name: string): string | undefined {
  const key = name
    .toLowerCase()
    .replace(/^(?:fa[bklrs]?|mdi)[: ]\s*/, '')
    .replace(/^(?:fa|mdi)-/, '')
    .replace(/-(?:outline|bold|solid|regular|retro|alt|o)$/, '');
  return lucideIcons[aliases[key] ?? key];
}
