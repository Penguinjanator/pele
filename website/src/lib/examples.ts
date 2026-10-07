export const homeExample = `flowchart TD
  A[Mermaid text] --> B{Flowchart?}
  B -- Yes --> C[Pele]
  B -- No --> D[Mermaid]
  C --> E([SVG])
  D --> E`;

export const themeExample = `flowchart LR
  A[Variables] --> B(Light)
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
  beta: boolean;
}

const SAMPLES_PER_TYPE = 6;

const statements = (source: string): string[] =>
  source.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n').map((line) => line.trim())
    .filter((line) => line && !line.startsWith('%%'));

// Mermaid's documentation is partly in British English. The site is in American English, so
// its examples are respelled, names and labels alike.
const AMERICAN: [RegExp, string][] = [
  [/(analy)s(?=e|ing)/gi, '$1z'],
  [/(authori|populari|recogni|standardi|summari)s(?=[aei])/gi, '$1z'],
  [/(catalog)ue/gi, '$1'],
  [/(gr)e(?=y\b)/gi, '$1a'],
  [/(licen)c(?=e)/gi, '$1s'],
  [/(model)l(?=ed|ing)/gi, '$1'],
];
const american = (source: string): string => AMERICAN.reduce((text, [british, spelling]) => text.replace(british, spelling), source);

const sourcesOf = (corpus: unknown): string[] =>
  Array.isArray(corpus) ? corpus.filter((source): source is string => typeof source === 'string' && source.trim() !== '').map(american) : [];

// Mermaid marks a type it may still change with `-beta` in its keyword. A type is one of those
// when its documentation has no example written without it.
const isBeta = (sources: string[]): boolean =>
  sources.length > 0 && sources.every((source) => statements(source)[0]?.split(/\s/)[0].endsWith('-beta'));

function sampleLabel(source: string, index: number): string {
  const title = source.match(/^---\n[\s\S]*?^title:\s*(.+)$[\s\S]*?^---$/m)?.[1];
  const lines = statements(source);
  const statement = lines[1] ?? lines[0] ?? 'Empty';
  const text = title?.replace(/^(["'])(.*)\1$/, '$2') ?? statement;
  return `${index + 1}. ${text.length > 48 ? `${text.slice(0, 47)}…` : text}`;
}

// The fullest few examples of each diagram type, from Mermaid's documentation.
function pick(sources: string[]): PlaygroundSample[] {
  const longest = new Set([...sources].sort((a, b) => b.length - a.length).slice(0, SAMPLES_PER_TYPE));
  return sources.filter((source) => longest.has(source)).map((source, index) => ({ label: sampleLabel(source, index), source }));
}

export function sampleGroups(corpora: Record<string, unknown>): SampleGroup[] {
  return Object.entries(corpora)
    .map(([path, corpus]) => {
      const sources = sourcesOf(corpus);
      return { type: path.match(/([\w-]+)-docs\.json$/)?.[1] ?? path, samples: pick(sources), beta: isBeta(sources) };
    })
    .filter((group) => group.samples.length > 0)
    .sort((a, b) => Number(b.type === 'flowchart') - Number(a.type === 'flowchart') || Number(a.beta) - Number(b.beta) || a.type.localeCompare(b.type));
}

// Names for the examples page, which lists the types by name.
const TYPE_TITLES = new Map([
  ['flowchart', 'Flowchart'],
  ['swimlane', 'Swimlane'],
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
  ['treeview', 'Tree view'],
  ['cynefin', 'Cynefin'],
  ['wardley', 'Wardley map'],
  ['eventmodeling', 'Event modeling'],
  ['usecase', 'Use case'],
  ['venn', 'Venn'],
  ['ishikawa', 'Ishikawa'],
  ['packet', 'Packet'],
  ['radar', 'Radar'],
  ['treemap', 'Treemap'],
]);

// Info only prints a version number, which is not much of an example.
const UNLISTED = new Set(['info']);

const FIRST_LIMIT = 500;
const FULLER_LIMIT = 1000;

export interface ExampleGroup {
  type: string;
  title: string;
  slug: string;
  sources: string[];
  beta: boolean;
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

// Pele uses CSS variables for colors, so any other fill or stroke in the SVG is a color the example chose.
// The source is checked too, for theme variables, which Pele does not draw, and for styles nothing uses.
const RE_OWN_PAINT = /(?:fill|stroke)(?:="|:)(?!none|currentColor|var\()/;
const RE_OWN_STYLE = /themeVariables|\b(?:fill|stroke)\s*:/;
const ownColors = (source: string, svg: string): boolean => RE_OWN_PAINT.test(svg) || RE_OWN_STYLE.test(source);

// Two examples of each type from Mermaid's documentation: the fullest one of moderate size,
// and a larger one that is not a variation of it. Examples that leave their colors to the theme
// come first; one that sets its own is shown only when the type has no other.
export function exampleGroups(corpora: Record<string, unknown>, draw: (source: string) => string | undefined): ExampleGroup[] {
  return Object.entries(corpora)
    .map(([path, corpus]) => {
      const type = path.match(/([\w-]+)-docs\.json$/)?.[1] ?? path;
      const all = sourcesOf(corpus);
      const drawn = [...new Set(all)].map((source) => ({ source, svg: draw(source) })).filter((example) => example.svg !== undefined);
      const themed = drawn.filter((example) => !ownColors(example.source, example.svg!));
      const usable = (themed.length > 0 ? themed : drawn).map((example) => example.source);
      const bySize = [...usable].sort((a, b) => b.length - a.length);
      const first = bySize.find((source) => source.length <= FIRST_LIMIT) ?? bySize.at(-1);
      const sources = first === undefined ? [] : [first];
      const fuller = bySize.find((source) => source !== first && source.length <= FULLER_LIMIT && overlap(source, first!) < 0.5);
      if (fuller !== undefined) sources.push(fuller);
      const title = TYPE_TITLES.get(type) ?? type;
      return { type, title, slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), sources, beta: isBeta(all) };
    })
    .filter((group) => group.sources.length > 0 && !UNLISTED.has(group.type))
    .sort((a, b) => Number(a.beta) - Number(b.beta) || a.title.localeCompare(b.title));
}

export const examplesTitle = 'Examples';
export const examplesDescription = 'Browse supported diagram types.';
