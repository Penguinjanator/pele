---
title: Introduction
description: Pele renders Mermaid diagram text to SVG. It has no dependencies, runs synchronously, and takes its colors and fonts from CSS custom properties.
---

## Goals

Pele is a renderer for [Mermaid](https://mermaid.js.org) diagrams, designed for [Obsidian](https://obsidian.md) and usable anywhere JavaScript runs.

- **Compatible.** Pele reads Mermaid syntax. A diagram written for Mermaid should parse to the same nodes, edges, and groups in Pele. See [Compatibility](/compatibility).
- **Fast.** Rendering is one synchronous function call that returns a string. There is no worker and no `await`.
- **Light.** Pele has no runtime dependencies and does not need a DOM.
- **Themeable.** The SVG contains no colors of its own choosing. It refers to `--pele-*` custom properties, so the page's CSS decides how a diagram looks. See [Theming](/theming).

## Status

Pele is in early development and has not had a stable release. The API, the SVG structure, and the list of theme tokens are subject to change.

Flowcharts (`graph` and `flowchart`) are implemented. The other Mermaid diagram types are planned. Until a type is implemented, `render()` throws a [`PeleError`](/api#peleerror) with the code `unsupported-diagram` and [`supports()`](/api#supports) returns `false`, so an app can fall back to another renderer.

## Install

```shell
npm install @kepano/pele
```

Pele is an ES module and includes TypeScript types.

## Usage

Pass Mermaid text to `render()` and insert the SVG it returns.

```ts
import { render } from '@kepano/pele';

const { svg } = render(`flowchart LR
  A[Mermaid text] --> B[SVG]`);

document.querySelector('#diagram').innerHTML = svg;
```

`render()` throws when the text cannot be rendered. Check `supports()` first to decide whether Pele can handle a diagram, and catch `PeleError` to report syntax errors.

```ts
import { PeleError, render, supports } from '@kepano/pele';

function draw(source: string, element: HTMLElement) {
  if (!supports(source)) return false;
  try {
    element.innerHTML = render(source).svg;
  } catch (error) {
    if (!(error instanceof PeleError)) throw error;
    element.textContent = error.message;
  }
  return true;
}
```

The diagram uses neutral default colors until you set the theme tokens. A minimal theme is a few lines of CSS.

```css
.pele {
  --pele-fg: #100f0f;
  --pele-line: #100f0f;
  --pele-surface: #f2f0e5;
  --pele-border: #cecdc3;
  --pele-font: Inter, sans-serif;
}
```

Try diagrams in the [Playground](/playground), or continue to the [API](/api).
