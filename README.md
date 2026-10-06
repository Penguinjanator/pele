# Pele

Pele renders [Mermaid](https://mermaid.js.org) diagrams to SVG. It is small, synchronous, has no dependencies, and uses CSS variables for colors and fonts.

Pele supports every diagram type built into Mermaid 12.1.0.

Documentation, examples, and a playground are at [pele.run](https://pele.run).

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

In a browser, `mount()` renders into an element, reads fonts from CSS, and adapts the layout to the container width:

```ts
import { mount } from 'pele';

mount(document.querySelector('#diagram'), text);
```

`supports(text)` checks whether a diagram type is available. `render()` throws a `PeleError` for unsupported types, syntax errors, and other rendering failures.

The main entry point includes every diagram type. Reduce the initial bundle size by registering individual types or loading them on demand:

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

Set CSS variables on the diagram or a parent element to customize colors and fonts:

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

Charts use `--pele-series-1` through `--pele-series-8`. Colors adapt to theme changes without being re-rendered. See [Theming](https://pele.run/theming) for all variables, fonts, and class names.

## Security

The SVG contains no scripts, event handlers, or HTML, and Pele never runs code from a diagram. Links and images are limited to web addresses by default, and both the source and the output have a size limit. An error message quotes the diagram source, so show it as text. See [SECURITY.md](SECURITY.md) for handling untrusted diagrams.

## Compatibility

Pele targets the syntax of Mermaid 12.1.0. Each of its parsers runs Mermaid's own parser specs for that diagram type and is fuzzed against Mermaid's parser. Layout and visual style are Pele's own.

## Develop

```sh
npm install
npm test
npm run build
npm run bench
```

The documentation site and playground are in `website/`:

```sh
cd website
pnpm install
pnpm dev
```

After installing the website dependencies, run `npm run test:website` from the repository root to check the playground.

See [Contributing](CONTRIBUTING.md) for parser testing and website deployment.

## License

MIT. The specs under `tests/compat` and the grammar files beside them come from Mermaid, which is also MIT licensed.
