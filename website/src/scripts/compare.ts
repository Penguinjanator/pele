import { renderMermaid } from './playground-mermaid';

// Mermaid draws one diagram at a time, and only those that have come near the screen.
const waiting: HTMLElement[] = [];
let busy = false;

async function next(): Promise<void> {
  if (busy) return;
  const holder = waiting.shift();
  if (!holder) return;
  busy = true;
  try {
    const { svg } = await renderMermaid(holder.dataset.mermaidSource ?? '', 'dark');
    holder.innerHTML = svg;
  } catch (error) {
    const message = document.createElement('pre');
    message.className = 'example-error';
    message.textContent = error instanceof Error ? error.message : String(error);
    holder.replaceChildren(message);
  }
  busy = false;
  void next();
}

const watcher = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    watcher.unobserve(entry.target);
    waiting.push(entry.target as HTMLElement);
  }
  void next();
}, { rootMargin: '600px 0px' });

for (const holder of document.querySelectorAll<HTMLElement>('[data-mermaid-source]')) watcher.observe(holder);
