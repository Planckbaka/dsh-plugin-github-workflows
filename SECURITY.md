# Security Policy

## Supported versions

Only the latest tagged release receives security fixes.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting:
**Security → Report a vulnerability** on this repository. Do not open a
public issue for security problems. You should get a response within 72
hours.

## How this plugin handles credentials

This plugin never stores credentials and never transmits them anywhere
except to `github.com` (or your configured `GH_HOST`) via the official
`gh` CLI / GitHub REST API:

| Auth source | How it travels | Logged? |
|---|---|--- |
| gh's own login (`gh auth login`) | gh keyring, untouched by the plugin | No |
| `GH_TOKEN` / `GITHUB_TOKEN` environment | inherited process environment | No |
| PAT via `github_auth` action `setup` | piped through **stdin** of the gh child process — never in argv, never in the rendered command line or UI cards | No |
| git credential fallback | `git credential fill` output stays in host-process memory and is injected only into the gh child's environment; prompts are hard-disabled (`GCM_INTERACTIVE=never`, `GIT_TERMINAL_PROMPT=0`) | No |

Tool results, UI call cards, and logs sanitize token parameters (`***`).
If you ever see a token rendered by this plugin, please report it as a
security vulnerability.

## Command execution model

All gh/git invocations are spawned as **argv arrays without a shell**, so
model-supplied text (PR titles, bodies, search queries) can never be
re-interpreted as shell syntax. Destructive actions require an explicit
`confirm: true` and can be hard-disabled with the `allowDestructive`
config. The raw `github_cli` passthrough is off by default and blocks
browser/interactive commands.
