/**
 * github_pr — pull request workflows over `gh pr`.
 */
import { str, enumStr, bool, int, strArr, repoParam, jqParam, confirmParam } from '../schema.js'

const LIST_JSON =
  'number,title,state,isDraft,author,headRefName,baseRefName,updatedAt,createdAt,url,labels,reviewDecision'
const VIEW_JSON =
  'number,title,body,state,isDraft,author,createdAt,updatedAt,closedAt,mergedAt,url,headRefName,baseRefName,additions,deletions,changedFiles,labels,assignees,reviewRequests,reviewDecision,mergeable,mergeStateStatus,milestone'

/** @type {import('../types.js').DomainDef} */
const domain = {
  tool: 'github_pr',
  title: 'Pull requests',
  description:
    'Full pull-request workflow: create, list, view, diff, checks, comment, ' +
    'review, merge, close/reopen, edit, mark ready, checkout. Structured JSON ' +
    'for list/view (trim with `jq`). Typical loop: create (or list) → checks → ' +
    'review → merge. Commits themselves belong to git — push with the shell, ' +
    'then manage the PR here.',
  params: {
    repo: repoParam('Repository "owner/name" for the pull request (defaults to config defaultRepo or the current directory\'s git remote).'),
    number: int('Pull request number (view/diff/checks/comment/review/merge/close/reopen/edit/ready/checkout).'),
    title: str('create: PR title; edit: new title.'),
    body: str('create/edit: PR or review/comment body (Markdown).'),
    fill: bool('create: derive title/body from commit messages instead of passing them.'),
    draft: bool('create: create as draft.'),
    base: str('create/edit: target branch to merge into.'),
    head: str('create: source branch ("branch" or "owner:branch"; defaults to the current branch).'),
    reviewers: strArr('create: handles to request reviews from.'),
    assignees: strArr('create: handles to assign.'),
    labels: strArr('create: label names to add.'),
    milestone: str('create: milestone name.'),
    state: enumStr(['open', 'closed', 'merged', 'all'], 'list: pull request state filter (default open).'),
    search: str('list: GitHub search query to filter results (e.g. "status:success review:required").'),
    author: str('list: filter by author ("@me" for yourself).'),
    headBranch: str('list: filter by head branch name.'),
    baseBranch: str('list: filter by base branch name.'),
    limit: int('list: maximum results (default 30).'),
    diffFormat: enumStr(['patch', 'name_only'], 'diff: "patch" for a unified diff (default), "name_only" for changed file names.'),
    reviewType: enumStr(['approve', 'request_changes', 'comment'], 'review: the kind of review to submit.'),
    mergeMethod: enumStr(['merge', 'squash', 'rebase'], 'merge: merge strategy (defaults to the repository default).'),
    deleteBranch: bool('merge/close: delete the local and remote branch afterwards.'),
    auto: bool('merge: enable auto-merge (merges as soon as requirements are met).'),
    subject: str('merge: override the merge commit subject.'),
    comment: str('close/reopen: optional comment to leave with the state change.'),
    addLabels: strArr('edit: labels to add.'),
    removeLabels: strArr('edit: labels to remove.'),
    addReviewers: strArr('edit: reviewers to add.'),
    branchName: str('checkout: local branch name to use (defaults to the head branch name).'),
    jq: jqParam(),
    confirm: confirmParam(),
  },
  actions: {
    create: {
      help: 'Create a pull request. Provide title/body (or fill=true to use commit messages).',
      needs: [],
      check: (a) =>
        !a.title && !a.fill ? 'github_pr create: provide `title` (plus optional `body`) or `fill: true`.' : null,
      argv: (a) => {
        const argv = ['pr', 'create']
        if (a.title) argv.push('--title', a.title)
        if (a.body) argv.push('--body', a.body)
        if (a.fill) argv.push('--fill')
        if (a.draft) argv.push('--draft')
        if (a.base) argv.push('--base', a.base)
        if (a.head) argv.push('--head', a.head)
        for (const r of a.reviewers ?? []) argv.push('--reviewer', r)
        for (const r of a.assignees ?? []) argv.push('--assignee', r)
        for (const l of a.labels ?? []) argv.push('--label', l)
        if (a.milestone) argv.push('--milestone', a.milestone)
        return argv
      },
    },
    list: {
      help: 'List pull requests (state/search/author/branch filters, JSON output).',
      needs: [],
      json: LIST_JSON,
      argv: (a) => {
        const argv = ['pr', 'list']
        argv.push('--state', a.state ?? 'open')
        if (a.search) argv.push('--search', a.search)
        if (a.author) argv.push('--author', a.author)
        if (a.headBranch) argv.push('--head', a.headBranch)
        if (a.baseBranch) argv.push('--base', a.baseBranch)
        for (const l of a.labels ?? []) argv.push('--label', l)
        if (a.limit) argv.push('--limit', String(a.limit))
        return argv
      },
    },
    view: {
      help: 'Show one pull request in full (metadata, counts, mergeability) as JSON.',
      needs: ['number'],
      json: VIEW_JSON,
      argv: (a) => ['pr', 'view', String(a.number)],
    },
    diff: {
      help: 'Show the diff of a pull request (patch or changed-file names).',
      needs: ['number'],
      argv: (a) => {
        const argv = ['pr', 'diff', String(a.number), '--color', 'never']
        if (a.diffFormat === 'name_only') argv.push('--name-only')
        else argv.push('--patch')
        return argv
      },
    },
    checks: {
      help: 'Show CI check status for a pull request.',
      needs: ['number'],
      argv: (a) => ['pr', 'checks', String(a.number)],
    },
    comment: {
      help: 'Comment on a pull request (requires `body`).',
      needs: ['number', 'body'],
      argv: (a) => ['pr', 'comment', String(a.number), '--body', a.body],
    },
    review: {
      help: 'Submit a review (approve / request_changes / comment; requires `reviewType`).',
      needs: ['number', 'reviewType'],
      argv: (a) => {
        const argv = ['pr', 'review', String(a.number)]
        if (a.reviewType === 'approve') argv.push('--approve')
        else if (a.reviewType === 'request_changes') argv.push('--request-changes')
        else argv.push('--comment')
        if (a.body) argv.push('--body', a.body)
        return argv
      },
    },
    merge: {
      help: 'DESTRUCTIVE: merge a pull request (choose mergeMethod; deleteBranch/auto optional).',
      needs: ['number'],
      destructive: true,
      argv: (a) => {
        const argv = ['pr', 'merge', String(a.number)]
        if (a.mergeMethod === 'merge') argv.push('--merge')
        else if (a.mergeMethod === 'squash') argv.push('--squash')
        else if (a.mergeMethod === 'rebase') argv.push('--rebase')
        if (a.deleteBranch) argv.push('--delete-branch')
        if (a.auto) argv.push('--auto')
        if (a.subject) argv.push('--subject', a.subject)
        if (a.body) argv.push('--body', a.body)
        return argv
      },
    },
    close: {
      help: 'Close a pull request (optional `comment`; deleteBranch also removes the branch).',
      needs: ['number'],
      argv: (a) => {
        const argv = ['pr', 'close', String(a.number)]
        if (a.comment) argv.push('--comment', a.comment)
        if (a.deleteBranch) argv.push('--delete-branch')
        return argv
      },
    },
    reopen: {
      help: 'Reopen a closed pull request.',
      needs: ['number'],
      argv: (a) => {
        const argv = ['pr', 'reopen', String(a.number)]
        if (a.comment) argv.push('--comment', a.comment)
        return argv
      },
    },
    edit: {
      help: 'Edit title/body/base/labels/reviewers of a pull request.',
      needs: ['number'],
      argv: (a) => {
        const argv = ['pr', 'edit', String(a.number)]
        if (a.title) argv.push('--title', a.title)
        if (a.body) argv.push('--body', a.body)
        if (a.base) argv.push('--base', a.base)
        for (const l of a.addLabels ?? []) argv.push('--add-label', l)
        for (const l of a.removeLabels ?? []) argv.push('--remove-label', l)
        for (const r of a.addReviewers ?? []) argv.push('--add-reviewer', r)
        return argv
      },
    },
    ready: {
      help: 'Mark a draft pull request ready for review (set draft=true to convert back to draft).',
      needs: ['number'],
      argv: (a) => {
        const argv = ['pr', 'ready', String(a.number)]
        if (a.draft === true) argv.push('--undo')
        return argv
      },
    },
    checkout: {
      help: 'Check out a pull request locally (requires a local git clone; optional `branchName`).',
      needs: ['number'],
      argv: (a) => {
        const argv = ['pr', 'checkout', String(a.number)]
        if (a.branchName) argv.push('--branch', a.branchName)
        return argv
      },
    },
    status: {
      help: 'Show PRs assigned to / created by / requesting review of you in the current repo.',
      needs: [],
      argv: () => ['pr', 'status'],
    },
  },
}

export default domain
