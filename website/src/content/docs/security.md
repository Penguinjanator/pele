---
title: Security
description: What Pele guarantees about the SVG it returns, and what the app that displays it has to take care of.
---

Pele is made to draw diagrams written by someone other than the reader, such as a diagram in a shared note. This page describes what the SVG can contain, the limits Pele applies, and the parts that are left to your app.

## What the SVG contains

The SVG is made only of drawing elements: shapes, paths, text, groups, links, and images. It has no scripts, no event handlers, no `<style>` element, no `<foreignObject>`, and no HTML. Text from the diagram is written as text, and is never read as markup.

Styles from `style` and `classDef` statements are kept only for a fixed list of properties such as `fill`, `stroke`, and `font-weight`. A value that contains `url(`, a semicolon, or anything else that could reach outside the declaration is dropped.

`click … call` and `click … callback` statements are parsed and ignored. Pele never runs code from a diagram, and Mermaid's `securityLevel` setting has no effect.

## Links and images

A diagram can link a node to an address, and a flowchart node can show an image. Pele keeps an address only when it is relative or uses one of these schemes:

| Used for | Schemes |
| --- | --- |
| Links | `http`, `https`, `mailto`, `tel` |
| Images | `http`, `https` |

Any other address is replaced with `about:blank`. That includes `file:` addresses, network shares such as `//host/share`, and schemes that open another application. This is stricter than Mermaid, which blocks only `javascript:`, `data:`, and `vbscript:`.

Use the [`linkSchemes`](/api#renderoptions) and [`imageSchemes`](/api#renderoptions) options to change the lists. The schemes you pass replace the defaults:

```ts
render(source, { linkSchemes: ['http', 'https', 'mailto', 'obsidian'] });
```

`javascript:`, `data:`, and `vbscript:` are refused whatever the options say.

An image is fetched as soon as the diagram is displayed, without a click, so its server learns that the diagram was opened and from which address. If that matters to your app, pass `imageSchemes: []` to keep only relative addresses, or block the requests with a content security policy.

Links have `rel="noopener"`. A `target` is written only when it is `_self`, `_blank`, `_parent`, or `_top`.

## Limits

| Limit | Default | Option |
| --- | --- | --- |
| Length of the source | 50,000 characters | [`limit`](/api#renderoptions) |
| Length of the SVG | 4,000,000 characters | [`outputLimit`](/api#renderoptions) |

A diagram over either limit, or one nested too deeply to process, throws a [`PeleError`](/api#peleerror) with the code `limit`. Mermaid has the first limit and not the second. A short source can describe a very large drawing, and a multi-megabyte SVG can stall the page it is inserted into.

`render()` is synchronous and has no time limit. An ordinary diagram takes a few milliseconds, and Pele's tests check that hostile input at the default source limit finishes within three seconds. If you raise the limits for text you do not trust, render in a worker that you can stop.

## What your app is responsible for

**Error messages are text.** A `PeleError` message and its `snippet` quote the diagram source. Show them with `textContent`, never with `innerHTML`.

```ts
try {
  element.innerHTML = render(source).svg;
} catch (error) {
  element.textContent = error.message;
}
```

**Icon markup is trusted.** Whatever your [`icons`](/api#renderoptions) function returns is written into the SVG as it is. The name it receives comes from the diagram, so look the name up in a set of icons you control and return nothing for a name you do not know. Do not build markup from the name.

**Internal links are names, not addresses.** A node with the class `internal-link` is reported in [`links`](/api#renderresult) with `internal: true`, and its label is in the `data-href` attribute. That label is whatever the diagram author wrote. Treat it as the name of a note to look up, and do not pass it to anything that opens a URL.

**Addresses in `links` have been filtered** in the same way as the ones in the SVG. If your app opens them itself, with its own handler instead of the browser's, it still decides what a click does.

**Options are trusted.** Values you pass in `options`, including `config`, come from your app. Do not fill them from the diagram or from anything else the author controls. Frontmatter and directives in the diagram are read as untrusted input.

**The SVG is safe as returned.** If your app changes it, or passes it through another tool, these guarantees depend on what that step does.

## Reporting a vulnerability

Report a security problem privately through [GitHub](https://github.com/kepano/pele/security/advisories/new), not in a public issue.
