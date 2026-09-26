# dsh-plugin-github-workflows

[![CI](https://github.com/Planckbaka/dsh-plugin-github-workflows/actions/workflows/ci.yml/badge.svg)](https://github.com/Planckbaka/dsh-plugin-github-workflows/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node >= 18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)
[![Release](https://img.shields.io/github/v/release/Planckbaka/dsh-plugin-github-workflows?include_prereleases)](https://github.com/Planckbaka/dsh-plugin-github-workflows/releases)

**English** | [简体中文](README.zh-CN.md)

Complete GitHub workflows for [DeepSeek Harness (DSH)](https://github.com/topics/dsh-plugin), built on the
[GitHub CLI](https://cli.github.com/) — commits, pull requests, issues,
releases, Actions, repositories, Codespaces and search, in one zero-dependency
plugin with 11 typed tools and 80+ actions.

## Why

- **Typed, not stringly** — every operation is a JSON-schema-typed tool with
  an `action` enum; commands are built as argv arrays and spawned **without a
  shell**, so model-supplied text can never inject shell syntax.
- **Safe by default** — destructive operations (merge, delete, force-push,
  rebuild, workflow dispatch…) require an explicit `confirm: true`, with a
  config master switch (`allowDestructive`) to hard-disable them all.
- **Zero-config auth** — reuses gh's login, `GH_TOKEN`, or falls back to the
  credential already stored in git's credential helper. If you can
  `git push`, the plugin just works.
- **Zero dependencies** — Node built-ins only; installs from a git repo or a
  local folder with nothing to resolve or build.

## Tools

| Tool | Coverage |
|---|---|
| `github_auth` | status, PAT login (token via stdin, never logged), refresh, account switch |
| `github_repo` | view / list / create / clone / fork / edit / sync / rename / archive / delete |
| `github_pr` | create / list / view / diff / checks / comment / review / merge / close / reopen / edit / ready / checkout / status |
| `github_issue` | create / list / view / status / comment / close (reason) / reopen / edit / develop (linked branch) |
| `github_commit` | read-only commit browsing (list / view / compare / branches) via the GitHub REST API |
| `github_release` | create (notes, generated notes, assets) / list / view / upload / download / edit / delete |
| `github_actions` | runs: list / view / log / watch / rerun / cancel / delete; workflows: list / view / dispatch |
| `github_codespace` | list / create / non-interactive ssh / cp / code / stop / rebuild / logs / delete |
| `github_search` | repos / issues / prs / code / commits |
| `github_api` | any REST/GraphQL request (escape hatch: labels, milestones, projects, gists, orgs, …) |
| `github_git` | local git: status / add / commit / push / pull / fetch / branch / log / remote |
| `github_cli` | raw gh passthrough, **off by default** (registered only with `allowRaw: true`) |

## Install

Requires: [DSH](https://github.com/topics/dsh-plugin), Node >= 18,
[gh CLI](https://cli.github.com/), git, and any one auth source (below).

Ask the agent to call `plugin_manager`, or use GUI **Settings → Plugins →
Install**:

```
install_bundle → target: github:Planckbaka/dsh-plugin-github-workflows
```

## Quick start

A typical "code → PR → CI → release" loop after installing:

```
github_auth       action: status                     ← verify authentication
github_git        action: status                     ← what changed?
github_git        action: add        paths: ["src"]
github_git        action: commit     message: "Fix ..."
github_git        action: push       setUpstream: true
github_pr         action: create     title: "Fix ..."  fill: true
github_actions    action: run_watch  runId: <id>       ← follow CI to green
github_pr         action: merge      mergeMethod: squash, deleteBranch: true, confirm: true
github_release    action: create     tag: v1.1.0, generateNotes: true, confirm via notes
```

## Authentication

The plugin reuses whatever credentials you already have, with an automatic
fallback chain:

1. gh already logged in (`gh auth login`) → used directly;
2. `GH_TOKEN` in the environment (e.g. `~/.dsh/.env`) → picked up natively by gh;
3. **git credential fallback** — when gh is not logged in, the plugin reads
   the `github.com` credential from git's credential helper (Git Credential
   Manager) once, prompts disabled, and injects it as `GH_TOKEN`.

You can also call `github_auth` with action `setup` and a PAT (piped via
stdin, never logged). See [SECURITY.md](SECURITY.md) for the full credential
model.

## Configuration

All keys optional — defaults live in `lib/index.js`; override them in the
plugin's `config` section (see [cordis.patch.yml](cordis.patch.yml)).

| Key | Default | Meaning |
|---|---|---|
| `ghPath` | `""` | Override path of the gh executable (PATH by default) |
| `gitPath` | `""` | Override path of the git executable (github_git + credential fallback) |
| `defaultRepo` | `""` | Default `owner/name` repository |
| `timeoutMs` | `60000` | Timeout for normal commands |
| `watchTimeoutMs` | `300000` | Timeout for watch/log actions |
| `maxOutputBytes` | `65536` | Output truncation threshold; overflow goes to a spill file |
| `allowRaw` | `false` | Register the `github_cli` passthrough tool |
| `allowDestructive` | `true` | Master switch for destructive actions |
| `env` | `{}` | Extra environment variables (e.g. `GH_HOST` for GHES) |

## Development

```bash
git clone https://github.com/Planckbaka/dsh-plugin-github-workflows.git
npm install --no-save typescript@5 @types/node   # optional: type checking
npx tsc --noEmit                                  # JSDoc types, no build step
npm test && npm run test:integration
```

Layout, the dsh-tools JSON-Schema subset rule, and the full contributor
guide are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Community standards

[Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md) ·
[Code of conduct](CODE_OF_CONDUCT.md) · [Changelog](CHANGELOG.md) ·
[Issues](https://github.com/Planckbaka/dsh-plugin-github-workflows/issues) ·
[Discussions](https://github.com/Planckbaka/dsh-plugin-github-workflows/discussions)

## License

[MIT](LICENSE)
