---
title: Pele · Mermaid diagrams as themeable SVG
description: Pele is a lightweight library that renders Mermaid diagrams to SVG, themed with CSS variables.
---

# Pele

Pele is a lightweight library that renders [Mermaid](https://mermaid.js.org) diagrams to SVG, [themed with CSS variables](/theming).

## How it works

Pass Mermaid text to Pele. It returns an SVG.

### Mermaid

```mermaid
flowchart TD
  A[Mermaid text] --> B{Flowchart?}
  B -- Yes --> C[Pele]
  B -- No --> D[Mermaid]
  C --> E([SVG])
  D --> E
```

The SVG has no colors of its own. Set a few CSS variables and every diagram follows your theme, without being rendered again.

### CSS

```css
.pele {
  --pele-bg: #fffcf0;
  --pele-fg: #100f0f;
  --pele-muted: #6f6e69;
  --pele-line: #100f0f;
  --pele-surface: #f2f0e5;
  --pele-surface-alt: #e6e4d9;
  --pele-border: #cecdc3;
}
```

## Pele in your app

Add Pele to your app using the [API](/api).

```shell
npm install @kepano/pele
```

```ts
import { render } from '@kepano/pele';

const { svg } = render(`flowchart LR
  A[Mermaid text] --> B[SVG]`);

document.querySelector('#diagram').innerHTML = svg;
```

## Explore

### [Examples](/examples)

Every diagram type that Pele draws.

### [API](/api)

Render diagrams, inspect them, and handle errors.

### [Theming](/theming)

Set colors and fonts with CSS variables.

### [Compatibility](/compatibility)

What Pele shares with Mermaid, and where it differs.

## Pele in use

Pele is [open source](https://github.com/kepano/pele). It is being built for [Obsidian](https://obsidian.md), to draw the Mermaid diagrams in your notes quickly and in the colors of your theme. Any app can use it. Pele is named after [Pele](https://en.wikipedia.org/wiki/Pele_(deity)), the Polynesian goddess of volcanoes and fire.

- [Obsidian](https://obsidian.md): Pele is in development as the renderer for Mermaid diagrams in notes.
- [Playground](/playground): Every diagram on this site is drawn by Pele. Edit one and compare it with Mermaid.
