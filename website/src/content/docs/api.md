---
title: API
description: Render Mermaid text to SVG, inspect the parsed diagram, and handle errors.
---

Pele exports four functions and one error class. Every function is synchronous, except the optional ones that [load diagram types on demand](#loading-only-what-you-need). The API is not final and is subject to change before a stable release.

```ts
import { render, parse, detectType, supports, PeleError } from 'pele';
```

## Usage

Pass Mermaid text to `render()` and insert the SVG it returns.

```ts
import { render } from 'pele';

const { svg } = render(`flowchart LR
  A[Mermaid text] --> B[SVG]`);

document.querySelector('#diagram').innerHTML = svg;
```

`render()` throws when the text cannot be rendered. Check `supports()` first to decide whether Pele can handle a diagram, and catch `PeleError` to report syntax errors.

```ts
import { PeleError, render, supports } from 'pele';

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

An error message quotes the diagram source, so show it as text. [Security](/security) lists what else an app that displays untrusted diagrams should take care of.

Pele is in early development and has not had a stable release. Every diagram type built into Mermaid is implemented. See [Examples](/examples) for what they look like and [Compatibility](/compatibility) for the full list.

## Loading only what you need

The main entry point includes every diagram type. An app that draws only a few types, or wants to fetch each type when it is first used, can import smaller pieces.

| Import | Contents |
| --- | --- |
| `pele` | Everything, in one file. |
| `pele/core` | The API with no diagram types. Add types with `register()`. |
| `pele/diagrams/<type>` | One diagram type, as the default export. `<type>` is a name that [`detectType()`](#detecttype) returns, such as `flowchart` or `sequence`. |
| `pele/lazy` | The API, plus functions that fetch a type on demand. |

Choose the types up front:

```ts
import { register, render } from 'pele/core';
import flowchart from 'pele/diagrams/flowchart';
import sequence from 'pele/diagrams/sequence';

register(flowchart, sequence);

const { svg } = render(source);
```

Or let Pele fetch each type the first time a diagram needs it. `renderAsync()` takes the same arguments as `render()` and returns a promise.

```ts
import { renderAsync } from 'pele/lazy';

const { svg } = await renderAsync(source);
```

`load(type)` fetches one type without rendering, and resolves to `false` for a type Pele does not draw. Once a type is loaded, `render()` from the same module draws it synchronously.

```ts
import { detectType, load, render } from 'pele/lazy';

await load(detectType(source));
const { svg } = render(source);
```

With `core` and `lazy`, [`supports()`](#supports) is `true` only for types that are registered or loaded. Use one of these entry points throughout an app. The main entry point keeps its own separate list of types.

## render

```ts
function render(text: string, options?: RenderOptions): RenderResult
```

Parses Mermaid text, lays out the diagram, and returns it as an SVG string. Throws a [`PeleError`](#peleerror) if the text cannot be rendered.

```ts
const result = render('flowchart TD\n  A --> B', { idPrefix: 'note-1-' });

container.innerHTML = result.svg;
```

The same text, options, and font measurements always produce the same SVG.

### RenderOptions

All options are optional.

| Option | Type | Description |
| --- | --- | --- |
| `measurer` | `TextMeasurer` | Measures label text. Defaults to a canvas measurer in browsers and a built-in width table elsewhere. See [Text measurement](#text-measurement). |
| `fontFamily` | `string` | Font used to measure labels. Set it to the font that `--pele-font` resolves to. The SVG still refers to `var(--pele-font)`. |
| `fontSize` | `number` | Base font size in pixels. Defaults to `16`. |
| `idPrefix` | `string` | Prefix for the ids of the accessible title and description. Use a different prefix for each diagram on a page that has them. |
| `responsive` | `boolean` | Shrinks the SVG to fit a container narrower than the diagram. It never grows past its natural size. Defaults to `true`. Set `false` for a fixed pixel size. A diagram that sets Mermaid's `useMaxWidth: false` is also fixed. |
| `now` | `number \| Date` | The time a Gantt chart treats as now, for the today marker and for tasks with no start date. Defaults to the current time. |
| `padding` | `number` | Space around the diagram in pixels. |
| `limit` | `number` | Maximum length of `text` in characters. The default is 50,000, as in Mermaid. Longer input throws a `PeleError` with the code `limit`. Pass `Infinity` for no limit. |
| `outputLimit` | `number` | Maximum length of the SVG in characters. The default is 4,000,000. A larger diagram throws a `PeleError` with the code `limit`. Pass `Infinity` for no limit. |
| `linkSchemes` | `string[]` | URL schemes a link may use. The default is `['http', 'https', 'mailto', 'tel']`. Relative addresses are always kept. See [Security](/security#links-and-images). |
| `imageSchemes` | `string[]` | URL schemes an image may use. The default is `['http', 'https']`. |
| `icons` | `(name: string) => string \| null \| undefined` | Returns the inner SVG markup for an icon name such as `fa:fa-car`. Without a resolver, the icon's space is left empty. The markup is inserted as it is, so return only markup you trust. |
| `config` | `object` | Mermaid configuration. Frontmatter and directives in the text take precedence over it. |

### RenderResult

| Field | Type | Description |
| --- | --- | --- |
| `svg` | `string` | The diagram as an `<svg>` element. |
| `width` | `number` | Natural width of the diagram in pixels. |
| `height` | `number` | Height of the diagram in pixels. |
| `type` | `DiagramType` | The detected diagram type, such as `'flowchart'`. |
| `links` | `LinkInfo[]` | Links found in the diagram, so an app can attach its own navigation without querying the SVG. |

Each `LinkInfo` has the `id` of the node that carries the link, its `href`, and `internal`. A node with a `click` link is reported with `internal: false`. A node with the class `internal-link` is reported with `internal: true` and its label text as the `href`. An address that is [not allowed](/security#links-and-images) is reported as `about:blank`.

## parse

```ts
function parse(text: string, options?: { limit?: number }): DiagramModel
```

Parses Mermaid text and returns the diagram model without laying it out or rendering it. Throws a `PeleError` for unsupported diagram types and syntax errors.

For a flowchart, the model has `direction`, `nodes`, `edges`, `subgraphs`, `classes`, and `tooltips`, along with `title`, `accTitle`, and `accDescr` when the source sets them. The exact shape of the model is subject to change.

```ts
const model = parse('flowchart LR\n  A[Start] --> B[End]');

model.direction;        // 'LR'
model.nodes.get('A');   // { id: 'A', text: 'Start', … }
model.edges.length;     // 1
```

## detectType

```ts
function detectType(text: string): DiagramType | null
```

Returns the diagram type that the text declares, or `null` if it is not a Mermaid diagram. Frontmatter, directives, and comments before the declaration are skipped.

`detectType()` recognizes every Mermaid diagram keyword, including types Pele cannot render yet. `'flowchart'`, `'sequence'`, `'class'`, `'state'`, `'er'`, `'pie'`, and `'gantt'` are some of the values it returns.

```ts
detectType('graph TD\n  A --> B');           // 'flowchart'
detectType('sequenceDiagram\n  A->>B: Hi');  // 'sequence'
detectType('Hello');                         // null
```

## supports

```ts
function supports(text: string): boolean
```

Returns `true` if the text declares a diagram type that Pele can render. It does not check the rest of the syntax, so `render()` can still throw a syntax error for text that `supports()` accepts.

```ts
supports('flowchart LR\n  A --> B');         // true
supports('sequenceDiagram\n  A->>B: Hi');    // false
```

## PeleError

`render()` and `parse()` throw a `PeleError` when they cannot handle the text. It extends `Error`.

| Property | Type | Description |
| --- | --- | --- |
| `message` | `string` | Description of the problem. Syntax errors follow the wording of Mermaid's parser errors. |
| `code` | `string` | One of the error codes below. |
| `type` | `string \| null` | The detected diagram type, when known. |
| `line` | `number` | Line of the problem, starting at 1. `0` when the error has no position. |
| `column` | `number` | Column of the problem, starting at 1. `0` when the error has no position. |
| `snippet` | `string` | The source line followed by a line that marks the column. Empty when the error has no position. |

### Error codes

| Code | Meaning |
| --- | --- |
| `unsupported-diagram` | The text is not a Mermaid diagram, or its type is one Pele does not draw. |
| `syntax` | The diagram could not be parsed. `line`, `column`, and `snippet` locate the problem. |
| `semantic` | The diagram parsed but describes something invalid. |
| `limit` | The text is longer than the `limit` option, the SVG is longer than the `outputLimit` option, or the diagram is nested too deeply to process. |

```ts
try {
  render(source);
} catch (error) {
  if (error instanceof PeleError && error.code === 'syntax') {
    console.log(`Line ${error.line}, column ${error.column}`);
    console.log(error.snippet);
  }
}
```

## Text measurement

Pele sizes nodes from the measured width of their labels. In a browser it measures with a canvas, using the `fontFamily` option. Without a canvas, such as in Node.js, it estimates widths from a built-in table of sans-serif metrics.

Pass a `measurer` to supply your own measurements. This interface is subject to change.

```ts
interface TextMeasurer {
  width(text: string, size: number, style: number): number;
}
```
