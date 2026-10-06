# Pele

Pele renders [Mermaid](https://mermaid.js.org) diagrams to SVG. It is small, synchronous, has no dependencies, and takes its colors and fonts from CSS variables. It is designed for [Obsidian](https://obsidian.md).

Pele is at an early stage. Flowcharts are implemented. Other Mermaid diagram types are planned.

## Install

```sh
npm install @kepano/pele
```

## Use

```ts
import { render } from '@kepano/pele';

const { svg } = render(`flowchart TD
  A[Mermaid text] --> B{Flowchart?}
  B -- Yes --> C[Pele]
  B -- No --> D[Mermaid]`);

document.querySelector('#diagram').innerHTML = svg;
```

`render()` throws a `PeleError` for a syntax error or a diagram type that is not implemented. `supports(text)` tells you in advance whether Pele can render a diagram, so an app can fall back to Mermaid.

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

## Compatibility

Pele targets the syntax of Mermaid 12.1.0. Its flowchart parser runs Mermaid's own parser specs and is fuzzed against the parser generated from Mermaid's grammar. Layout and visual style are Pele's own.

## Develop

```sh
npm install
npm test
npm run build
npm run bench
```

The documentation site and playground are in `website/`.

## License

MIT. The specs under `tests/compat` and the grammar files beside them come from Mermaid, which is also MIT licensed.
