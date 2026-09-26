/**
 * github_cli — raw `gh` pass-through, gated behind config `allowRaw: true`.
 *
 * Disabled by default: domain tools plus github_api already cover the safe
 * surface; raw pass-through bypasses every typed guard. When enabled, this
 * still blocks browser-opening and interactive commands, because those hang
 * a non-interactive host process.
 */
import { strArr } from '../schema.js'

/** First tokens that can never be useful non-interactively here. */
const BLOCKED_FIRST = new Set(['browse', 'preview', 'alias', 'help', 'credits'])
/** argv substrings that mark an interactive flow we cannot host. */
const BLOCKED_MARKERS = ['--interactive', '--editor', '--web', '-e', '--recover']

/** @type {import('../types.js').DomainDef} */
const domain = {
  tool: 'github_cli',
  title: 'Raw gh CLI',
  gated: true,
  description:
    'Run an arbitrary gh command verbatim (config allowRaw must be true). ' +
    'Browser-opening and interactive commands are blocked. Prefer the typed ' +
    'github_* tools or github_api; use this only for gh features they do ' +
    'not cover (e.g. gh gist, gh project, gh label, gh org).',
  params: {
    args: strArr('gh arguments after the executable, e.g. ["gist", "list"]. Use "--" inside the array for positional separators.'),
  },
  actions: {
    run: {
      help: 'Execute `gh <args...>` verbatim (requires args; interactive/browser commands are rejected).',
      needs: ['args'],
      argv: (a) => {
        const argv = a.args.map(String)
        if (argv.length === 0) return { error: 'github_cli: args must not be empty.' }
        const first = argv[0]
        if (BLOCKED_FIRST.has(first)) {
          return { error: `github_cli: "gh ${first}" opens a browser or is interactive-only and cannot run here.` }
        }
        if (first === 'auth' && argv[1] === 'login' && !argv.includes('--with-token')) {
          return { error: 'github_cli: interactive auth login is blocked — use the github_auth tool (setup action) instead.' }
        }
        if (first === 'codespace' && argv[1] === 'ssh' && !argv.includes('--')) {
          return { error: 'github_cli: interactive codespace ssh is blocked — pass a command after "--" or use the github_codespace tool (ssh action).' }
        }
        for (const marker of BLOCKED_MARKERS) {
          if (argv.includes(marker)) {
            return { error: `github_cli: flag "${marker}" is interactive/browser-only and cannot run here.` }
          }
        }
        return argv
      },
    },
  },
}

export default domain
