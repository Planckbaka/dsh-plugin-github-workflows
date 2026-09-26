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
| `github_cli` | raw gh passthrough, **off by default** (registered only with `allowRaw: true`) |

## Safety

- Commands are spawned as **argv arrays without a shell** — model-supplied text can never be injected;
- Destructive actions (merge, delete, archive, rebuild, workflow dispatch, …) require an explicit `confirm: true`, and `allowDestructive: false` hard-disables them all;
- The raw passthrough is gated behind `allowRaw` and blocks browser/interactive commands;
- PATs travel via stdin, never in command lines or logs;
- Timeouts (60s normal / 300s watch, configurable, capped at 600s) plus truncation with spill files.

## Authentication

The plugin reuses gh's own auth:

1. **Recommended**: put `GH_TOKEN=ghp_xxx` in `~/.dsh/.env` (the DSH host environment);
2. Or call `github_auth` with action `setup` and a PAT (piped securely via stdin);
3. Always start with `github_auth` action `status`.

## Configuration (all optional, see cordis.patch.yml)

| Key | Default | Meaning |
|---|---|---|
| `ghPath` | `""` | Override path of the gh executable (PATH by default) |
| `defaultRepo` | `""` | Default `owner/name` repository |
| `timeoutMs` | `60000` | Timeout for normal commands |
| `watchTimeoutMs` | `300000` | Timeout for watch/log actions |
| `maxOutputBytes` | `65536` | Output truncation threshold; overflow goes to a spill file |
| `allowRaw` | `false` | Register the `github_cli` passthrough tool |
| `allowDestructive` | `true` | Master switch for destructive actions |
| `env` | `{}` | Extra environment variables (e.g. `GH_HOST` for GHES) |

## Where are local commit writes?

gh has no commit command. `github_commit` is read-only browsing; create commits and push with git through the shell tools, then pick the work up with `github_pr create` etc.

## Install

```
plugin_manager: install_bundle → target: <absolute path to this directory>
```

Watch the returned `application` field (`applied` = live). Config changes hot-reload; code changes need a disable→enable toggle or an application restart.
