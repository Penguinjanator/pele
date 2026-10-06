---
title: Compatibility
description: What Pele shares with Mermaid, and where it differs on purpose.
---

Pele aims to accept the diagrams that Mermaid accepts, and to draw them in its own way. The source syntax is compatible. The layout and the visual style are not copies of Mermaid's.

## Mermaid version

Pele targets the syntax of Mermaid 12.1.0. Newer Mermaid syntax is adopted when Pele moves to a newer Mermaid version.

## Diagram types

| Type | Keywords | Status |
| --- | --- | --- |
| Flowchart | `graph`, `flowchart` | Implemented |
| Other Mermaid diagram types | `sequenceDiagram`, `classDiagram`, `stateDiagram`, `erDiagram`, and the rest | Planned |

For a type that is not implemented, [`supports()`](/api#supports) returns `false` and [`render()`](/api#render) throws a `PeleError` with the code `unsupported-diagram`. An app can use this to fall back to Mermaid for those diagrams.

## Syntax

Pele has its own flowchart parser. It is tested in two ways.

- It runs Mermaid's own flowchart parser spec suite. Two cases are skipped because they test details of Mermaid's implementation, not the syntax. The skipped cases are listed in the repository.
- It is fuzzed against the parser generated from Mermaid's grammar, comparing what the two parsers accept and the diagrams they produce.

Frontmatter, `%%{init}%%` directives, comments, and accessibility titles and descriptions are parsed as Mermaid parses them.

## Differences from Mermaid

### Layout and appearance

Pele has its own layout engine and its own visual style. A diagram has the same nodes, connections, and labels as in Mermaid, but positions, sizes, spacing, and routing differ. Output is not pixel-identical to Mermaid's, and is not meant to be.

Colors come from [theme tokens](/theming). Mermaid's named themes are not used.

### Subgraphs

A `direction` statement inside a subgraph always applies. In Mermaid it is ignored when one of the subgraph's nodes is linked to a node outside it. A subgraph with no `direction` statement uses the direction of the graph around it.

A subgraph with no name is accepted. Mermaid 12.1.0 fails on it.

### Limits

Pele has no limit on the number of edges. Mermaid stops at 500 unless configured otherwise. Use the [`limit`](/api#renderoptions) option to cap the length of the source.

### Labels

Labels are SVG text. Pele does not create HTML labels with `<foreignObject>`, so a label cannot contain arbitrary HTML. Line breaks, bold, and italic are supported, both in Markdown strings and with the `<br>`, `<b>`, and `<i>` tags. Other HTML tags in a label are removed and their text is kept.

### Interaction

`click` statements that open a link are supported. `click … call` and `click … callback` statements are parsed, but Pele never executes them. The SVG contains no scripts and no event handlers.

### Icons

An icon reference in a label, such as `fa:fa-car`, reserves space for the icon. Pele does not include icons. Pass an [`icons`](/api#renderoptions) resolver to `render()` to supply them.

## Reporting differences

If Mermaid accepts a flowchart that Pele rejects, or Pele parses it differently, that is a bug. Compare the two in the [Playground](/playground) and [report it](https://github.com/kepano/pele/issues).
