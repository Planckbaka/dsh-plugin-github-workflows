# Contributing to dsh-plugin-github-workflows

Thanks for your interest in improving this plugin! This document covers
development setup, project layout, the rules specific to DSH plugin
development, and the release process.

## Development setup

```bash
git clone https://github.com/Planckbaka/dsh-plugin-github-workflows.git
cd dsh-plugin-github-workflows
```

That's it — the plugin is **zero-dependency** (Node built-ins only), so no
`npm install` / `pnpm install` is needed to hack on it. You need:

- Node.js >= 18
- [gh CLI](https://cli.github.com/) >= 2.60 (for the tools to actually run)
- git

## Testing

```bash
npm test                 # schema subset compliance + argv builders + read-only gh smoke
npm run test:integration # full registry pipeline against fake ctx (no DSH needed)
npm run dump:argv        # print representative gh command lines for eyeballing
```

`npm test` requires a working `gh` on PATH but does NOT require
authentication (the unauthenticated path is part of the test). It must pass
before every commit.

## Project layout

```
├── cordis.patch.yml      # bundle entry (id: github) + default config
├── lib/
│   ├── index.js          # plugin entry: apply(ctx, config)
│   ├── gh.js             # gh/git runner: spawn, timeout, abort, truncation, auth fallback
│   ├── schema.js         # JSON-Schema helpers restricted to the dsh-tools subset
│   ├── registry.js       # domain-table driven tool registration + safety gates
│   └── domains/          # one file per resource domain (pr.js, issue.js, ...)
├── locale/               # plugin-manager card text (en/zh)
├── test/                 # selfcheck / integration / argv dump (plain node, no framework)
└── .github/              # CI, issue templates, PR template
```

### Adding or changing a tool domain

1. Edit or add `lib/domains/<domain>.js`: an action table mapping typed
   parameters to a gh/git argv array.
2. **Schema rule (critical)**: `dsh-tools` enforces a strict JSON-Schema
   subset — only `type / oneOf / properties / required /
   additionalProperties / items / enum / const` plus annotations
   (`description / title / default / examples`). Anything else rejects the
   tool at registration. Always build schemas through `lib/schema.js`
   helpers; never inline `{ minLength, pattern, anyOf, ... }`.
3. Mark destructive actions with `destructive: true` (confirm gate) or do a
   conditional inline check against `cfg.allowDestructive` +
   `args.confirm` (see `git.js` push/force for the pattern).
4. Never put secrets in argv — pipe tokens through stdin (`auth.js` setup
   action) or environment (`gh.js` fallback).
5. Add the new domain to `DOMAINS` in `lib/registry.js` and extend
   `test/selfcheck.mjs`.
6. Run `npm test && npm run test:integration`.

### DSH-specific constraints worth knowing

- Local installs are `link:` and do NOT resolve package dependencies — the
  plugin must stay zero-dependency.
- Config changes hot-reload (HMR); code changes need a disable→enable
  toggle or an app restart.
- gh flags drift between versions — verify any new flag with
  `gh <cmd> --help` before adding it to an argv builder.

## Commit style

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`,
`fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:` — imperative mood,
subject <= 72 chars, body explains "why" when non-obvious.

## Pull requests

1. Fork / branch from `main`.
2. Make sure `npm test && npm run test:integration` pass.
3. Update `CHANGELOG.md` under `## [Unreleased]`.
4. Open a PR using the template; CI (Ubuntu + Windows) must pass.

## Type checking (TypeScript without a build step)

This project is plain ESM JavaScript with **JSDoc types** (`lib/types.d.ts`)
checked by `tsc --noEmit` — no transpiler, no committed build output.

Why not full TypeScript? The plugin is installed directly from the git
repository (`install_bundle → github:...`), so the repo itself must contain
runnable JS. Full TS would require either committing built output (dual
source of truth) or a `prepare` build hook — which pnpm 11 flags as a build
script and prompts every installer to approve (`pendingBuilds`). JSDoc types
give us the same structural guarantees on the domain tables (`DomainDef`,
`ActionDef`), the runner (`Runner`, `RunResult`), and the config
(`PluginConfig`) with none of that friction.

Check types locally (nothing is added to package.json dependencies):

```bash
npm install --no-save typescript@5 @types/node
npx tsc --noEmit
```

The type check runs in CI on every platform before the tests.

## Release process (maintainers)

1. Bump `version` in `package.json`, move `CHANGELOG.md` `[Unreleased]` to
   the new version with a date.
2. Merge to `main`, then `git tag vX.Y.Z && git push --tags`.
3. `gh release create vX.Y.Z --generate-notes --latest`.
4. Reinstall locally if the package changed:
   `plugin_manager install_bundle` with the absolute directory path.
