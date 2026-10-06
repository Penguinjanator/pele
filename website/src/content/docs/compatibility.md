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
| Sequence | `sequenceDiagram` | Implemented |
| Class | `classDiagram` | Implemented |
| State | `stateDiagram`, `stateDiagram-v2` | Implemented |
| Entity relationship | `erDiagram` | Implemented |
| Gantt | `gantt` | Implemented |
| Git graph | `gitGraph` | Implemented |
| Pie | `pie` | Implemented |
| Mindmap | `mindmap` | Implemented |
| Kanban | `kanban` | Implemented |
| Timeline | `timeline` | Implemented |
| User journey | `journey` | Implemented |
| Quadrant chart | `quadrantChart` | Implemented |
| XY chart | `xychart`, `xychart-beta` | Implemented |
| Requirement | `requirementDiagram` | Implemented |
| Sankey | `sankey`, `sankey-beta` | Implemented |
| Architecture | `architecture-beta` | Implemented |
| C4 | `C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment` | Implemented |
| Block | `block`, `block-beta` | Implemented |
| Packet | `packet`, `packet-beta` | Implemented |
| Radar | `radar-beta` | Implemented |
| Treemap | `treemap`, `treemap-beta` | Implemented |
| Info | `info` | Implemented |
| Other Mermaid diagram types | `swimlane-beta`, `railroad-beta`, `venn-beta`, and the rest | Planned |

For a type that is not implemented, [`supports()`](/api#supports) returns `false` and [`render()`](/api#render) throws a `PeleError` with the code `unsupported-diagram`. An app can use this to fall back to Mermaid for those diagrams.

## Syntax

Pele has its own parser for each diagram type. Each one is tested in two ways.

- It runs Mermaid's own parser spec suite for that type. A few cases are skipped because they test details of Mermaid's implementation, not the syntax. The skipped cases are listed in the repository.
- It is fuzzed against Mermaid's parser for that type, comparing what the two parsers accept and the diagrams they produce.

Frontmatter, `%%{init}%%` directives, comments, and accessibility titles and descriptions are parsed as Mermaid parses them.

## Differences from Mermaid

### Layout and appearance

Pele has its own layout engine and its own visual style. A diagram has the same nodes, connections, and labels as in Mermaid, but positions, sizes, spacing, and routing differ. Output is not pixel-identical to Mermaid's, and is not meant to be.

Colors come from [theme tokens](/theming). Mermaid's named themes are not used.

### Sizing

A diagram is drawn at its natural size and shrinks to fit a narrower container, as in Mermaid. Unlike Mermaid, the SVG keeps its `width` and `height` attributes, so it also has a size when used as an image. Mermaid's `useMaxWidth: false` setting gives a fixed size, as does the [`responsive`](/api#renderoptions) option.

### Subgraphs

A `direction` statement inside a subgraph always applies. In Mermaid it is ignored when one of the subgraph's nodes is linked to a node outside it. A subgraph with no `direction` statement uses the direction of the graph around it.

A subgraph with no name is accepted. Mermaid 12.1.0 fails on it.

### Limits

Pele has no limit on the number of edges. Mermaid stops at 500 unless configured otherwise.

Like Mermaid, Pele refuses source longer than 50,000 characters by default. Change this with the [`limit`](/api#renderoptions) option.

In a very large graph, the longest edges are drawn as single curves that may pass behind nodes, instead of bending around every rank they cross.

### Labels

Labels are SVG text. Pele does not create HTML labels with `<foreignObject>`, so a label cannot contain arbitrary HTML. Line breaks, bold, and italic are supported, both in Markdown strings and with the `<br>`, `<b>`, and `<i>` tags. Other HTML tags in a label are removed and their text is kept.

### Interaction

`click` statements that open a link are supported. `click … call` and `click … callback` statements are parsed, but Pele never executes them. The SVG contains no scripts and no event handlers.

### Icons

An icon reference in a label, such as `fa:fa-car`, reserves space for the icon. Pele does not include icons. Pass an [`icons`](/api#renderoptions) resolver to `render()` to supply them.

## Reporting differences

If Mermaid accepts a diagram that Pele rejects, or Pele parses it differently, that is a bug. Compare the two in the [Playground](/playground) and [report it](https://github.com/kepano/pele/issues).
