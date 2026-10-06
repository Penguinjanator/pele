# Contributing

## Parser tests

Each diagram type has its own parser, tested against Mermaid's parser specs and with differential fuzzing.

The tests compare accepted syntax and parsed diagram data. Parser specs are in `tests/compat/<type>/`. Cases specific to Mermaid's implementation are skipped and documented in each directory's `SKIPPED.md`.

Run the library tests with `npm test`. Run `npm run test:website` after installing the website dependencies to check the playground.

## Deploy the website

GitHub Actions checks the library and builds the website on pull requests and pushes to `main`. After the checks pass, pushes to `main` deploy the site to [pele.run](https://pele.run).

CI reuses a successful full library test run when the library source, tests, tooling, locked dependencies, and Node version are unchanged. Website tests, typechecks, and both builds still run on every push. `npm test` always runs the complete library suite locally; website tests run separately with `npm run test:website`.

Add these repository secrets under **Settings → Secrets and variables → Actions**:

- `CLOUDFLARE_ACCOUNT_ID` — the account that owns the `pele` Worker.
- `CLOUDFLARE_API_TOKEN` — an API token with permission to deploy Workers in that account. Cloudflare's **Edit Cloudflare Workers** token template provides the required permissions.

For a manual deployment of the website and redirect Worker, run `pnpm run deploy` from `website/`.
