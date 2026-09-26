# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
