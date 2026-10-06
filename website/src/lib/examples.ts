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
