# Contributing

## Parser tests

Each diagram type has its own parser, tested against Mermaid's parser specs and with differential fuzzing.

The tests compare accepted syntax and parsed diagram data. Parser specs are in `tests/compat/<type>/`. Cases specific to Mermaid's implementation are skipped and documented in each directory's `SKIPPED.md`.

Run the library tests with `npm test`. Run `npm run test:website` after installing the website dependencies to check the playground.
