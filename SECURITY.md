# Security

Pele is made to draw diagrams written by someone other than the reader. The SVG it returns is meant to be safe to insert into a page as it is.

## Reporting a vulnerability

Report a security problem privately through [GitHub](https://github.com/kepano/pele/security/advisories/new), not in a public issue.

A report is in scope if a diagram can make Pele's output run script, load a resource other than an allowed link or image, break out of the SVG, or take unreasonably long to render at the default limits.

## What Pele guarantees

- The SVG has only drawing elements, links, and images. It has no scripts, event handlers, `<style>` elements, `<foreignObject>`, or HTML.
- Text from the diagram is written as text. Styles are limited to a fixed list of properties and cannot contain `url(`.
- `click … call` and `click … callback` statements are ignored. Pele never runs code from a diagram.
- A link is kept only if it is relative or uses `http`, `https`, `mailto`, or `tel`. An image is kept only if it is relative or uses `http` or `https`. Any other address becomes `about:blank`. The `linkSchemes` and `imageSchemes` options change the lists. `javascript:`, `data:`, and `vbscript:` are always refused.
- Source longer than 50,000 characters and output longer than 4,000,000 characters are refused with a `PeleError` of code `limit`. The `limit` and `outputLimit` options change this.

## What the app is responsible for

- Show a `PeleError` message as text, with `textContent`. It quotes the diagram source.
- Return only trusted markup from the `icons` option. It is inserted as it is. Look the name up in icons you control, and do not build markup from it.
- Treat an `internal-link` label, in `links` and in `data-href`, as the name of a note. Do not open it as a URL.
- Do not fill `options` or `options.config` from the diagram. They are trusted.
- An image loads when the diagram is displayed, which tells its server the diagram was opened. Pass `imageSchemes: []` or use a content security policy if that matters.
- `render()` has no time limit. If you raise the limits for untrusted text, render in a worker that you can stop.
