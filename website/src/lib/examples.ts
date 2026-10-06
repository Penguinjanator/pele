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

function sampleLabel(source: string, index: number): string {
  const title = source.match(/^---\n[\s\S]*?^title:\s*(.+)$[\s\S]*?^---$/m)?.[1];
  const lines = source.replace(/^---\n[\s\S]*?\n---\n/, '').split('\n').map((line) => line.trim())
    .filter((line) => line && !line.startsWith('%%'));
  const statement = lines.find((line) => !/^(?:graph|flowchart)\b/.test(line)) ?? lines[0] ?? 'Empty';
  return `${index + 1}. ${title?.replace(/^(["'])(.*)\1$/, '$2') ?? statement}`;
}

export function playgroundSamples(corpus: unknown): PlaygroundSample[] {
  if (!Array.isArray(corpus)) return [];
  return corpus.flatMap((source, index) => typeof source === 'string' && source.trim()
    ? [{ label: sampleLabel(source, index), source }]
    : []);
}
