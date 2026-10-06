type Mermaid = typeof import('mermaid').default;

let loading: Promise<Mermaid> | undefined;
let warmed = false;
let count = 0;

// Mermaid is only downloaded once a view that shows it is chosen.
export async function renderMermaid(source: string, theme: 'default' | 'dark'): Promise<{ svg: string; time: number }> {
  const mermaid = await (loading ??= import('mermaid').then((module) => module.default));
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme });
  if (!warmed) {
    // Mermaid loads each diagram type on first use. Keep that out of the timing.
    warmed = true;
    try {
      await mermaid.render(`mermaid-warmup-${count++}`, source);
    } catch {
      // The timed render below reports the error.
    }
  }
  const started = performance.now();
  const { svg } = await mermaid.render(`mermaid-${count++}`, source);
  return { svg, time: performance.now() - started };
}
