---
title: Compatibility
description: Compare syntax, layout, and features with Mermaid.
---

Pele supports Mermaid syntax with its own layout engine and visual style.

## Diagram types

Pele supports every diagram type built into Mermaid 12.1.0. Browse the [examples](/examples).

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

ZenUML is a separate Mermaid plugin and is not supported. For unsupported diagram types, [`supports()`](/api#supports) returns `false` and [`render()`](/api#render) throws a `PeleError` with the code `unsupported-diagram`. An app can use this to fall back to Mermaid.

## Syntax

Frontmatter, `%%{init}%%` directives, comments, and accessibility titles and descriptions are parsed as Mermaid parses them.

## Differences from Mermaid

### Layout and appearance

Diagrams preserve the nodes, connections, and labels from the source. Positions, sizes, spacing, and edge routing differ from Mermaid.

Colors come from [CSS variables](/theming). Mermaid's named themes are not used.

### Sizing

Diagrams scale down to fit narrower containers. Pass [`maxWidth`](/api#narrow-screens) to adapt supported layouts to the available width and keep labels readable. Horizontal diagrams can switch to a vertical layout on narrow screens.

The SVG retains its `width` and `height` attributes, giving it an intrinsic size when used as an image. Set `responsive: false` or Mermaid's `useMaxWidth: false` for a fixed size.

### Subgraphs

A `direction` statement inside a subgraph always applies. In Mermaid it is ignored when one of the subgraph's nodes is linked to a node outside it. A subgraph with no `direction` statement uses the direction of the graph around it.

A subgraph with no name is accepted. Mermaid 12.1.0 fails on it.

### Limits

Pele has no limit on the number of edges. Mermaid stops at 500 unless configured otherwise.

The default source limit is 50,000 characters, matching Mermaid. Pele also limits SVG output to 4,000,000 characters. Change these with [`limit` and `outputLimit`](/api#renderoptions).

In large graphs, long edges use simplified curves that may pass behind nodes.

### Labels

Labels are SVG text. Pele does not create HTML labels with `<foreignObject>`, so a label cannot contain arbitrary HTML. Line breaks, bold, and italic are supported, both in Markdown strings and with the `<br>`, `<b>`, and `<i>` tags. Other HTML tags in a label are removed and their text is kept.

### Interaction

`click` statements that open a link are supported. `click … call` and `click … callback` statements are parsed, but Pele never executes them. The SVG contains no scripts and no event handlers.

Links and images are filtered by URL scheme. See [Security](/security#links-and-images) for allowed schemes and configuration.

### Icons

An icon reference in a label, such as `fa:fa-car`, reserves space for the icon. Pele does not include icons. Pass an [`icons`](/api#renderoptions) resolver to `render()` to supply them.

## Reporting differences

If Mermaid accepts a diagram that Pele rejects, or Pele parses it differently, that is a bug. Compare the two in the [Playground](/playground) and [report it](https://github.com/kepano/pele/issues).
