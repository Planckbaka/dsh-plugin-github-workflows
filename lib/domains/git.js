/**
 * github_git — local git operations for the GitHub workflow.
 *
 * gh has no commit command; this tool covers the local half of the loop
 * (status → add → commit → push) with the same argv-array safety model as
 * the gh tools. History-rewriting operations (amend, force push, branch
 * delete) require confirm: true AND the config allowDestructive switch.
 */
import { str, bool, int, strArr, confirmParam } from '../schema.js'

export default {
  tool: 'github_git',
  title: 'Local git',
  bin: 'git',
  description:
    'Local git operations completing the GitHub workflow: status, stage ' +
    '(add), commit, push, pull, fetch, branch (list/create/delete), log, ' +
    'and remotes. Runs in the current working directory (the session ' +
    'workspace). Typical loop: status → add → commit → push, then switch to ' +
    'github_pr to open or manage the pull request. Force/amend/delete ' +
    'history-affecting variants require confirm: true.',
  params: {
    paths: strArr('add: file paths (or ["."] for everything; directories recurse).'),
    all: bool('commit: stage all tracked modifications first (-a).'),
    message: str('commit: commit message (-m).'),
    amend: bool('commit: amend the previous commit instead of creating one (confirm required).'),
    noEdit: bool('commit: with amend, keep the previous message instead of requiring a new one.'),
    remote: str('push/pull/fetch: remote name (default "origin").'),
    branch: str('push/pull: branch to push/pull; branch action: branch name to create/delete.'),
    setUpstream: bool('push: set the upstream for the branch (-u).'),
    force: bool('push: force-update the remote branch using --force-with-lease (confirm required).'),
    rebase: bool('pull: rebase local commits on top of the fetched branch instead of merging.'),
    create: bool('branch: create (and switch to) the branch instead of listing (-c).'),
    deleteBranch: bool('branch: delete the branch instead of listing (confirm required).'),
    listAll: bool('branch: list both local and remote branches (-a).'),
    oneline: bool('log: one commit per line (--oneline).'),
    limit: int('log: maximum commits to show (-n, default 20).'),
    remoteName: str('remote action: name of the remote to add/set (e.g. "upstream").'),
    remoteUrl: str('remote action: URL for add/set-url (e.g. "https://github.com/owner/repo.git").'),
    setUrl: bool('remote action: with remoteName+remoteUrl, change an existing remote\'s URL instead of adding a new one.'),
    short: bool('status: terse --short --branch output.'),
    confirm: confirmParam(),
  },
  actions: {
    status: {
      help: 'Show the working tree status (changes, staged files, branch).',
      needs: [],
      argv: (a) => {
        const argv = ['status']
        if (a.short) argv.push('--short', '--branch')
        return argv
      },
    },
    add: {
      help: 'Stage files (requires `paths`, e.g. ["."] for all changes).',
      needs: ['paths'],
      argv: (a) => ['add', '--', ...a.paths],
    },
    commit: {
      help: 'Create a commit (requires `message`, or amend=true with noEdit=true).',
      needs: [],
      check: (a) =>
        !a.message && !(a.amend && (a.noEdit || a.message))
          ? 'github_git commit: provide `message` (or amend=true with noEdit=true).'
          : null,
      argv: (a, cfg) => {
        if (a.amend) {
          if (cfg.allowDestructive !== true || a.confirm !== true) {
            return { error: 'github_git commit: --amend rewrites the last commit — set confirm: true (and allowDestructive).' }
          }
        }
        const argv = ['commit']
        if (a.all) argv.push('--all')
        if (a.amend) argv.push('--amend')
        if (a.message) argv.push('--message', a.message)
        else argv.push('--no-edit')
        return argv
      },
    },
    push: {
      help: 'Push commits to the remote (origin by default; setUpstream for new branches).',
      needs: [],
      argv: (a, cfg) => {
        const argv = ['push']
        if (a.force) {
          if (cfg.allowDestructive !== true || a.confirm !== true) {
            return { error: 'github_git push: force-updating the remote branch discards remote commits — set confirm: true (uses --force-with-lease).' }
          }
          argv.push('--force-with-lease')
        }
        if (a.remote) argv.push(a.remote)
        if (a.branch) argv.push(a.branch)
        if (a.setUpstream) argv.push('--set-upstream')
        return argv
      },
    },
    pull: {
      help: 'Fetch and merge from the remote (rebase=true to rebase instead).',
      needs: [],
      argv: (a) => {
        const argv = ['pull']
        if (a.remote) argv.push(a.remote)
        if (a.branch) argv.push(a.branch)
        if (a.rebase === true) argv.push('--rebase')
        return argv
      },
    },
    fetch: {
      help: 'Fetch refs from the remote without merging.',
      needs: [],
      argv: (a) => {
        const argv = ['fetch']
        if (a.remote) argv.push(a.remote)
        if (a.branch) argv.push(a.branch)
        return argv
      },
    },
    branch: {
      help: 'List branches; create=true switches to a new `branch`; deleteBranch=true removes one (confirm).',
      needs: [],
      argv: (a, cfg) => {
        if (a.create) {
          if (!a.branch) return { error: 'github_git branch: create requires `branch` (the new name).' }
          return ['switch', '--create', a.branch]
        }
        if (a.deleteBranch) {
          if (!a.branch) return { error: 'github_git branch: deleteBranch requires `branch`.' }
          if (cfg.allowDestructive !== true || a.confirm !== true) {
            return { error: 'github_git branch: deleting a branch — set confirm: true (uses -d; -D only via shell).' }
          }
          return ['branch', '--delete', a.branch]
        }
        const argv = ['branch']
        if (a.listAll) argv.push('--all')
        return argv
      },
    },
    log: {
      help: 'Show commit history (oneline/limit for compact output).',
      needs: [],
      argv: (a) => {
        const argv = ['log', `-n${a.limit ?? 20}`]
        if (a.oneline) argv.push('--oneline')
        return argv
      },
    },
    remote: {
      help: 'List remotes; remoteName+remoteUrl add a new remote (setUrl=true changes an existing one\'s URL).',
      needs: [],
      argv: (a) => {
        if (a.remoteName && a.remoteUrl) {
          return a.setUrl
            ? ['remote', 'set-url', a.remoteName, a.remoteUrl]
            : ['remote', 'add', a.remoteName, a.remoteUrl]
        }
        return ['remote', '--verbose']
      },
    },
  },
}
