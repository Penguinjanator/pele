export const homeExample = `flowchart TD
  A[Mermaid text] --> B{Flowchart?}
  B -- Yes --> C[Pele]
  B -- No --> D[Mermaid]
  C --> E([SVG])
  D --> E`;

export const themeExample = `flowchart LR
  A[Tokens] --> B(Light)
  A --> C(Dark)
  subgraph Themes
    B
    C
  end`;

export const themeCss = `.pele {
  --pele-bg: #fffcf0;
  --pele-fg: #100f0f;
  --pele-muted: #6f6e69;
  --pele-line: #100f0f;
  --pele-surface: #f2f0e5;
  --pele-surface-alt: #e6e4d9;
  --pele-border: #cecdc3;
}`;

export const playgroundExample = `flowchart TD
  A([Mermaid text]) --> B{Supported?}
  B -- Yes --> C[Parse]
  B -- No --> H[Fall back]

  subgraph Pele
    C --> D[Layout]
    D --> E[Render]
  end

  E --> F[(SVG)]
  F -.-> G[Theme with CSS]
`;

export interface PlaygroundSample {
  label: string;
  source: string;
}

export interface SampleGroup {
  type: string;
  samples: PlaygroundSample[];
}

const SAMPLES_PER_TYPE = 6;

function sampleLabel(source: string, index: number): string {
  const title = source.match(/^---\n[\s\S]*?^title:\s*(.+)$[\s\S]*?^---$/m)?.[1];
  const lines = source.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n').map((line) => line.trim())
    .filter((line) => line && !line.startsWith('%%'));
  const statement = lines[1] ?? lines[0] ?? 'Empty';
  const text = title?.replace(/^(["'])(.*)\1$/, '$2') ?? statement;
  return `${index + 1}. ${text.length > 48 ? `${text.slice(0, 47)}…` : text}`;
}

// The fullest few examples of each diagram type, from Mermaid's documentation.
function pick(corpus: unknown): PlaygroundSample[] {
  if (!Array.isArray(corpus)) return [];
  const sources = corpus.filter((source): source is string => typeof source === 'string' && source.trim() !== '');
  const longest = new Set([...sources].sort((a, b) => b.length - a.length).slice(0, SAMPLES_PER_TYPE));
  return sources.filter((source) => longest.has(source)).map((source, index) => ({ label: sampleLabel(source, index), source }));
}

export function sampleGroups(corpora: Record<string, unknown>): SampleGroup[] {
  return Object.entries(corpora)
    .map(([path, corpus]) => ({ type: path.match(/([\w-]+)-docs\.json$/)?.[1] ?? path, samples: pick(corpus) }))
    .filter((group) => group.samples.length > 0)
    .sort((a, b) => Number(b.type === 'flowchart') - Number(a.type === 'flowchart') || a.type.localeCompare(b.type));
}

// Names for the examples page, in the order the types are shown.
const TYPE_TITLES = new Map([
  ['flowchart', 'Flowchart'],
  ['sequence', 'Sequence'],
  ['class', 'Class'],
  ['state', 'State'],
  ['er', 'Entity relationship'],
  ['gantt', 'Gantt'],
  ['git', 'Git graph'],
  ['pie', 'Pie'],
  ['mindmap', 'Mindmap'],
  ['kanban', 'Kanban'],
  ['timeline', 'Timeline'],
  ['journey', 'User journey'],
  ['quadrant', 'Quadrant chart'],
  ['xychart', 'XY chart'],
  ['requirement', 'Requirement'],
  ['sankey', 'Sankey'],
  ['architecture', 'Architecture'],
  ['c4', 'C4'],
  ['block', 'Block'],
  ['agentflow', 'Agentflow'],
  ['railroad', 'Railroad'],
  ['packet', 'Packet'],
  ['radar', 'Radar'],
  ['treemap', 'Treemap'],
  ['info', 'Info'],
]);

const FIRST_LIMIT = 500;
const FULLER_LIMIT = 1000;

export interface ExampleGroup {
  type: string;
  title: string;
  slug: string;
  sources: string[];
}

const lines = (source: string): Set<string> => new Set(source.split('\n').map((line) => line.trim()).filter(Boolean));

// The share of the smaller example's lines that the other one repeats.
function overlap(a: string, b: string): number {
  const first = lines(a);
  const second = lines(b);
  let shared = 0;
  for (const line of first) if (second.has(line)) shared++;
  return shared / Math.max(1, Math.min(first.size, second.size));
}

// Two examples of each type from Mermaid's documentation: the fullest one of moderate size,
// and a larger one that is not a variation of it.
export function exampleGroups(corpora: Record<string, unknown>, renders: (source: string) => boolean): ExampleGroup[] {
  const order = [...TYPE_TITLES.keys()];
  const rank = (type: string): number => (order.includes(type) ? order.indexOf(type) : order.length);
  return Object.entries(corpora)
    .map(([path, corpus]) => {
      const type = path.match(/([\w-]+)-docs\.json$/)?.[1] ?? path;
      const all = Array.isArray(corpus) ? corpus.filter((source): source is string => typeof source === 'string' && source.trim() !== '') : [];
      const usable = [...new Set(all)].filter(renders);
      const bySize = [...usable].sort((a, b) => b.length - a.length);
      const first = bySize.find((source) => source.length <= FIRST_LIMIT) ?? bySize.at(-1);
      const sources = first === undefined ? [] : [first];
      const fuller = bySize.find((source) => source !== first && source.length <= FULLER_LIMIT && overlap(source, first!) < 0.5);
      if (fuller !== undefined) sources.push(fuller);
      const title = TYPE_TITLES.get(type) ?? type;
      return { type, title, slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), sources };
    })
    .filter((group) => group.sources.length > 0)
    .sort((a, b) => rank(a.type) - rank(b.type) || a.type.localeCompare(b.type));
}

export const examplesTitle = 'Examples';
export const examplesDescription = 'Every diagram type that Pele draws, with examples from Mermaid\'s documentation.';
