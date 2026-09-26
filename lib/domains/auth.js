/**
 * github_auth — gh authentication management.
 *
 * `auth token` is deliberately NOT exposed: it would print a live secret
 * into the session log. Token-based login pipes the token through stdin
 * (never argv, never displayed).
 */
import { str, strArr } from '../schema.js'

const HOST = str(
  'GitHub hostname to operate on, e.g. "github.com" or a GitHub Enterprise ' +
    'host. Defaults to github.com.',
)

/** @type {import('../types.js').DomainDef} */
const domain = {
  tool: 'github_auth',
  title: 'GitHub authentication',
  description:
    'Manage gh CLI authentication: check login status, authenticate with a ' +
    'personal access token (piped securely via stdin), refresh scopes, or ' +
    'switch between accounts. Start with action "status" before any other ' +
    'GitHub operation; unauthenticated hosts make every other github_* tool fail.',
  params: {
    hostname: HOST,
    token: str(
      'setup only: personal access token (classic PAT or fine-grained). ' +
        'Passed to gh through stdin — it never appears in command lines or logs. ' +
        'Alternatively export GH_TOKEN in the DSH host environment (~/.dsh/.env) ' +
        'and gh picks it up without any login.',
    ),
    scopes: strArr('refresh only: additional scopes to request, e.g. ["repo", "read:org"].'),
    user: str('switch only: account username to switch to.'),
  },
  actions: {
    status: {
      help: 'Show authentication status per host (logged-in account, scopes, token validity). Safe first call.',
      needs: [],
      argv: (a) => {
        const argv = ['auth', 'status']
        if (a.hostname) argv.push('--hostname', a.hostname)
        return argv
      },
      note: 'exit code 1 with "not logged in" is expected when unauthenticated — read stderr for guidance.',
    },
    setup: {
      help: 'Authenticate with a PAT (requires the `token` parameter; piped via stdin, never logged).',
      needs: ['token'],
      argv: (a) => {
        const argv = ['auth', 'login', '--with-token', '--git-protocol', 'https']
        if (a.hostname) argv.push('--hostname', a.hostname)
        return argv
      },
      stdin: (a) => `${String(a.token).trim()}\n`,
    },
    refresh: {
      help: 'Refresh the session and (optionally) request additional scopes; may open a browser for re-authorization.',
      needs: [],
      argv: (a) => {
        const argv = ['auth', 'refresh']
        if (a.hostname) argv.push('--hostname', a.hostname)
        for (const scope of a.scopes ?? []) argv.push('--scopes', scope)
        return argv
      },
    },
    switch: {
      help: 'Switch the active account for a host (multi-account workflows).',
      needs: [],
      argv: (a) => {
        const argv = ['auth', 'switch']
        if (a.hostname) argv.push('--hostname', a.hostname)
        if (a.user) argv.push('--user', a.user)
        return argv
      },
    },
  },
}

export default domain
