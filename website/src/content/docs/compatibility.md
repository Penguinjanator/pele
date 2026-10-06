---
title: Compatibility
description: Pele shares with Mermaid, and where it differs on purpose.
---

Pele aims to accept the diagrams that Mermaid accepts, and to draw them in its own way. The source syntax is compatible. The layout and the visual style are not copies of Mermaid's.

## Diagram types

Pele supports every diagram type built into Mermaid 12.1.0. See [Examples](/examples) for a drawing of each one.

| Type | Keywords |
| --- | --- |
| Flowchart | `graph`, `flowchart` |
| Swimlane | `swimlane-beta` |
| Sequence | `sequenceDiagram` |
| Class | `classDiagram` |
| State | `stateDiagram`, `stateDiagram-v2` |
| Entity relationship | `erDiagram` |
| Gantt | `gantt` |
| Git graph | `gitGraph` |
| Pie | `pie` |
| Mindmap | `mindmap` |
| Kanban | `kanban` |
| Timeline | `timeline` |
| User journey | `journey` |
| Quadrant chart | `quadrantChart` |
| XY chart | `xychart`, `xychart-beta` |
| Requirement | `requirementDiagram` |
| Sankey | `sankey`, `sankey-beta` |
| Architecture | `architecture-beta` |
| C4 | `C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment` |
| Block | `block`, `block-beta` |
| Agentflow | `agentflow-beta` |
| Railroad | `railroad-beta`, `railroad-ebnf-beta`, `railroad-abnf-beta`, `railroad-peg-beta` |
| Tree view | `treeView-beta` |
| Cynefin | `cynefin-beta` |
| Wardley map | `wardley-beta` |
| Event modeling | `eventmodeling` |
| Use case | `usecase-beta` |
| Venn | `venn-beta` |
| Ishikawa | `ishikawa`, `ishikawa-beta` |
| Packet | `packet`, `packet-beta` |
| Radar | `radar-beta` |
| Treemap | `treemap`, `treemap-beta` |
| Info | `info` |

ZenUML is a separate Mermaid plugin and is not supported. For text that Pele cannot draw, [`supports()`](/api#supports) returns `false` and [`render()`](/api#render) throws a `PeleError` with the code `unsupported-diagram`. An app can use this to fall back to Mermaid.

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

A diagram is drawn at its natural size and shrinks to fit a narrower container, as in Mermaid. An app can also tell Pele the width it has, and many diagrams are then [drawn to fit it](/api#narrow-screens), which Mermaid does not do. A diagram that runs across may be drawn running down on a narrow screen. Unlike Mermaid, the SVG keeps its `width` and `height` attributes, so it also has a size when used as an image. Mermaid's `useMaxWidth: false` setting gives a fixed size, as does the [`responsive`](/api#renderoptions) option.

### Subgraphs

A `direction` statement inside a subgraph always applies. In Mermaid it is ignored when one of the subgraph's nodes is linked to a node outside it. A subgraph with no `direction` statement uses the direction of the graph around it.

A subgraph with no name is accepted. Mermaid 12.1.0 fails on it.

### Limits

Pele has no limit on the number of edges. Mermaid stops at 500 unless configured otherwise.

Like Mermaid, Pele refuses source longer than 50,000 characters by default. Change this with the [`limit`](/api#renderoptions) option. Pele also refuses to return an SVG longer than 4,000,000 characters, which Mermaid has no limit for. Change this with the [`outputLimit`](/api#renderoptions) option.

In a very large graph, the longest edges are drawn as single curves that may pass behind nodes, instead of bending around every rank they cross.

### Labels

Labels are SVG text. Pele does not create HTML labels with `<foreignObject>`, so a label cannot contain arbitrary HTML. Line breaks, bold, and italic are supported, both in Markdown strings and with the `<br>`, `<b>`, and `<i>` tags. Other HTML tags in a label are removed and their text is kept.

### Interaction

`click` statements that open a link are supported. `click … call` and `click … callback` statements are parsed, but Pele never executes them. The SVG contains no scripts and no event handlers.

A link may be relative or use `http`, `https`, `mailto`, or `tel`, and an image may be relative or use `http` or `https`. Mermaid allows every scheme except `javascript`, `data`, and `vbscript`. Pele replaces any other address with `about:blank`, unless the app allows its scheme. See [Security](/security#links-and-images).

### Icons

An icon reference in a label, such as `fa:fa-car`, reserves space for the icon. Pele does not include icons. Pass an [`icons`](/api#renderoptions) resolver to `render()` to supply them.

## Reporting differences

If Mermaid accepts a diagram that Pele rejects, or Pele parses it differently, that is a bug. Compare the two in the [Playground](/playground) and [report it](https://github.com/kepano/pele/issues).
