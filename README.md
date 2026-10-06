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

Charts take the colors of their series from `--pele-series-1` to `--pele-series-8`. A diagram follows a change of theme without being rendered again.

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

The documentation site and playground are in `website/`:

```sh
cd website
pnpm install
pnpm dev
```

After installing the website dependencies, run `npm run test:website` from the repository root to check the playground.

## Deploy the website

GitHub Actions checks the library and builds the website on pull requests and pushes to `main`. After the checks pass, pushes to `main` deploy the site to [pele.run](https://pele.run).

CI reuses a successful full library test run when the library source, tests, tooling, locked dependencies, and Node version are unchanged. Website tests, typechecks, and both builds still run on every push. `npm test` always runs the complete library suite locally; website tests run separately with `npm run test:website`.

Add these repository secrets under **Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_ACCOUNT_ID` — the account that owns the `pele` Worker.
- `CLOUDFLARE_API_TOKEN` — an API token with permission to deploy Workers in that account. Cloudflare's **Edit Cloudflare Workers** token template provides the required permissions.

For a manual deployment of the website and redirect Worker, run `pnpm run deploy` from `website/`.

## License

MIT. The specs under `tests/compat` and the grammar files beside them come from Mermaid, which is also MIT licensed.
