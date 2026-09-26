# dsh-plugin-github

A DeepSeek Harness (DSH) plugin: complete GitHub workflows on top of the [GitHub CLI](https://cli.github.com/) (`gh`).

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

## Safety

- Commands are spawned as **argv arrays without a shell** — model-supplied text can never be injected;
- Destructive actions (merge, delete, archive, rebuild, workflow dispatch, …) require an explicit `confirm: true`, and `allowDestructive: false` hard-disables them all;
- The raw passthrough is gated behind `allowRaw` and blocks browser/interactive commands;
- PATs travel via stdin, never in command lines or logs;
- Timeouts (60s normal / 300s watch, configurable, capped at 600s) plus truncation with spill files.

## Authentication

The plugin reuses whatever credentials you already have, with an automatic fallback chain:

1. gh already logged in (`gh auth login`) → used directly;
2. `GH_TOKEN` in the environment (e.g. `~/.dsh/.env`) → picked up natively by gh;
3. **git credential fallback**: when gh is not logged in, the plugin reads the
   `github.com` credential from git's credential helper (Git Credential
   Manager / Windows Credential Manager) once — prompts disabled — and injects
   it as `GH_TOKEN`. Any machine that can `git push` works with zero extra setup.

You can also call `github_auth` with action `setup` and a PAT (piped via stdin, never logged).

## Configuration (all optional, see cordis.patch.yml)

| Key | Default | Meaning |
|---|---|---|
| `ghPath` | `""` | Override path of the gh executable (PATH by default) |
| `gitPath` | `""` | Override path of the git executable (github_git tool + credential fallback) |
| `defaultRepo` | `""` | Default `owner/name` repository |
| `timeoutMs` | `60000` | Timeout for normal commands |
| `watchTimeoutMs` | `300000` | Timeout for watch/log actions |
| `maxOutputBytes` | `65536` | Output truncation threshold; overflow goes to a spill file |
| `allowRaw` | `false` | Register the `github_cli` passthrough tool |
| `allowDestructive` | `true` | Master switch for destructive actions |
| `env` | `{}` | Extra environment variables (e.g. `GH_HOST` for GHES) |

## Requirements

- gh CLI (`winget install GitHub.cli` or https://cli.github.com/) and git installed;
- any one auth source from the chain above (most commonly: git already pushes on this machine).

## Where are local commit writes?

`github_git` covers the local git loop (status → add → commit → push);
`github_commit` is read-only browsing (list / view / compare / branches).
The standard flow: `github_git` commit+push → `github_pr create` →
`github_actions run_watch` → `github_release create`.

## Install (from GitHub)

Ask the agent to call `plugin_manager`, or use GUI Settings → Plugins → Install:

```
install_bundle → target: github:Planckbaka/dsh-plugin-github
```

## Install (local development)

```
plugin_manager: install_bundle → target: <absolute path to this directory>
```

Watch the returned `application` field (`applied` = live). Config changes hot-reload; code changes need a disable→enable toggle or an application restart.
