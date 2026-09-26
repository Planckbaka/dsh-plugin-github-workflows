# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Static type checking without a build step: `lib/types.d.ts` (JSDoc types
  for `DomainDef`, `ActionDef`, `PluginConfig`, `Runner`, `RunResult`),
  annotated domain tables and runner surface, `tsconfig.json` with
  `checkJs`, and a CI `tsc --noEmit` step on both platforms. The plugin
  stays zero-dependency plain ESM — TypeScript is a dev-time check only.

## [0.2.2] - 2026-09-26

### Fixed
- `authInfo` misreported `ghAuthenticated: true` when gh was unauthenticated
  AND no git credential existed (the fallback-absence was conflated with
  gh being logged in); the auth state is now a three-way resolved object
  and startup logs an explicit "no credential found" warning.
- `github_api` `paginate` parameter description now matches the behavior
  (`--paginate --slurp` are applied together automatically).
- SECURITY.md credential table rendering (malformed separator row).

### Changed
- `integration.mjs` rewritten as a hermetic assertion suite: a recording
  fake runner (never spawns) verifies all safety gates (destructive
  confirm / allowDestructive, needs, check, requiresRepo), argv / `--json`
  / `--jq` / `--repo` injection, watch-vs-normal timeout routing, gh/git
  binary routing, raw-passthrough blocking, render shape, and token
  masking — 25+ hard assertions with a non-zero exit on failure.
- `selfcheck.mjs` gains runner-internal tests: output truncation with a
  real on-disk spill file (verified, then cleaned up) and command-display
  quoting of arguments containing spaces.
- `apply(ctx, config, runner?)` accepts an optional runner injection for
  hermetic tests; host installations are unchanged.

## [0.2.1] - 2026-09-26

### Added
- Complete open-source project scaffolding (GitHub community standards):
  `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue templates
  (bug / feature request), pull request template.
- CI workflow (`ci.yml`): Ubuntu + Windows matrix running syntax checks,
  the schema/argv selfcheck, and the registry integration test on every
  push and pull request.
- `npm` scripts: `test`, `test:integration`, `dump:argv`.
- Package metadata: `repository`, `bugs`, `homepage`, `author`, `engines`
  (Node >= 18), discovery `keywords`.
- Bilingual README with badges, language switcher, and a quick-start
  workflow tour; Chinese README relocated to `README.zh-CN.md`.

### Changed
- Package name aligned with the repository: `dsh-plugin-github-workflows`.
- Line endings normalized to LF via `.gitattributes`; editor defaults via
  `.editorconfig`.

## [0.2.0] - 2026-09-26

### Added
- `github_git` tool: local git operations (status / add / commit / push /
  pull / fetch / branch / log / remote) with confirm-gated amend,
  force-with-lease push, and branch deletion.
- Authentication fallback chain: gh login → `GH_TOKEN` environment →
  git credential helper (reads the stored `github.com` credential once,
  prompts disabled, injects it as `GH_TOKEN` when gh is unauthenticated).
- Runner support for the git binary with a `gitPath` config override.

## [0.1.0] - 2026-09-26

### Added
- Initial release: 10 domain tools over the GitHub CLI — `github_auth`,
  `github_repo`, `github_pr`, `github_issue`, `github_commit` (read-only),
  `github_release`, `github_actions`, `github_codespace`,
  `github_search`, `github_api` — plus the gated `github_cli` passthrough
  (registered only with `allowRaw: true`).
- Shell-free argv-array execution, confirm-gated destructive actions,
  PAT login via stdin, per-call timeouts with abort support, and output
  truncation with spill files.
- Zero-dependency host plugin (Node built-ins only); installable from a
  local directory or directly from this repository.
