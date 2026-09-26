/**
 * github_commit — read-only commit browsing over `gh api` (REST endpoints).
 *
 * gh has no `gh commit` command; these actions hit the REST API directly.
 * Creating commits and pushing is intentionally NOT covered: use local git
 * through the shell, then manage PRs/releases with the other github_* tools.
 */
import { str, bool, int, repoParam, jqParam } from '../schema.js'

const LIST_JQ_DEFAULT = '[.[] | {sha: .sha[0:8], message: .commit.message, author: .commit.author.name, date: .commit.author.date}]'
const BRANCHES_JQ_DEFAULT = '[.[] | {name, protected: .protected}]'

/** @type {import('../types.js').DomainDef} */
const domain = {
  tool: 'github_commit',
  title: 'Commits (read-only)',
  description:
    'Read-only commit browsing via the GitHub REST API: list commits (by ' +
    'branch/path), view one commit with its diff, compare two refs, list ' +
    'branches. Creating commits / pushing is a local git job — use the shell ' +
    'for that and this tool to inspect and discuss the result.',
  params: {
    repo: repoParam('Repository "owner/name" (required unless config defaultRepo is set).'),
    sha: str('view: commit SHA or ref (branch/tag name); list: branch or SHA to start listing from.'),
    path: str('list: only commits touching this path.'),
    base: str('compare: the base ref (branch, tag, or SHA).'),
    head: str('compare: the head ref to compare against base.'),
    protectedBranches: bool('branches: only list protected branches.'),
    limit: int('list/branches: page size for the API (default 20).'),
    jq: jqParam(),
  },
  actions: {
    list: {
      help: 'List commits of a repository (optionally filtered by branch `sha` and `path`).',
      needs: [],
      requiresRepo: true,
      defaultJq: LIST_JQ_DEFAULT,
      argv: (a, cfg, repo) => {
        const argv = ['api', '-X', 'GET', `repos/${repo}/commits`]
        if (a.sha) argv.push('-f', `sha=${a.sha}`)
        if (a.path) argv.push('-f', `path=${a.path}`)
        argv.push('-f', `per_page=${a.limit ?? 20}`)
        return argv
      },
    },
    view: {
      help: 'Show one commit in full (message, stats, per-file patch) — requires `sha`.',
      needs: ['sha'],
      requiresRepo: true,
      argv: (a, cfg, repo) => ['api', '-X', 'GET', `repos/${repo}/commits/${a.sha}`],
    },
    compare: {
      help: 'Compare two refs (requires `base` and `head`, e.g. main...feature).',
      needs: ['base', 'head'],
      requiresRepo: true,
      argv: (a, cfg, repo) => ['api', '-X', 'GET', `repos/${repo}/compare/${a.base}...${a.head}`],
    },
    branches: {
      help: 'List branches of a repository (optionally only protected ones).',
      needs: [],
      requiresRepo: true,
      defaultJq: BRANCHES_JQ_DEFAULT,
      argv: (a, cfg, repo) => {
        const argv = ['api', '-X', 'GET', `repos/${repo}/branches`]
        if (a.protectedBranches === true) argv.push('-f', 'protected=true')
        argv.push('-f', `per_page=${a.limit ?? 20}`)
        return argv
      },
    },
  },
}

export default domain
