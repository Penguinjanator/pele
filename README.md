# Pele

Pele renders [Mermaid](https://mermaid.js.org) diagrams to SVG. It is small, synchronous, has no dependencies, and uses CSS variables for colors and fonts.

Pele supports every diagram type built into Mermaid 12.1.0.

## Install

```sh
npm install pele
```

## Use

```ts
import { render } from 'pele';

const { svg } = render(`flowchart TD
  A[Mermaid text] --> B{Flowchart?}
  B -- Yes --> C[Pele]
  B -- No --> D[Mermaid]`);

document.querySelector('#diagram').innerHTML = svg;
```

`render()` throws a `PeleError` for a syntax error or for text it cannot draw. `supports(text)` tells you in advance whether Pele can render a diagram, so an app can fall back to Mermaid.

The main entry point includes every diagram type. To load less, register the types you need on the core, or let Pele fetch each type when it is first used:

```ts
import { register, render } from 'pele/core';
import flowchart from 'pele/diagrams/flowchart';

register(flowchart);
```

```ts
import { renderAsync } from 'pele/lazy';

const { svg } = await renderAsync(text);
```

## Theme

The SVG has no colors of its own. Set these properties on the diagram or any element around it:

```css
.pele {
  --pele-bg: #fffcf0;
  --pele-fg: #100f0f;
  --pele-muted: #6f6e69;
  --pele-line: #100f0f;
  --pele-surface: #f2f0e5;
  --pele-surface-alt: #e6e4d9;
  --pele-border: #cecdc3;
  --pele-accent: #205ea6;
  --pele-font: sans-serif;
  --pele-radius: 4px;
}
```

A diagram follows a change of theme without being rendered again.

## Security

The SVG contains no scripts, event handlers, or HTML, and Pele never runs code from a diagram. Links and images are limited to web addresses by default, and both the source and the output have a size limit. An error message quotes the diagram source, so show it as text. See [SECURITY.md](SECURITY.md) for what an app that displays untrusted diagrams should take care of.

## Compatibility

Pele targets the syntax of Mermaid 12.1.0. Each of its parsers runs Mermaid's own parser specs for that diagram type and is fuzzed against Mermaid's parser. Layout and visual style are Pele's own.

## Develop

```sh
npm install
npm test
npm run build
npm run bench
```

## License

MIT. The specs under `tests/compat` and the grammar files beside them come from Mermaid, which is also MIT licensed.
