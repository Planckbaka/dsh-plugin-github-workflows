/**
 * github_issue — issue workflows over `gh issue`.
 */
import { str, enumStr, bool, int, strArr, repoParam, jqParam } from '../schema.js'

const LIST_JSON = 'number,title,state,author,updatedAt,createdAt,url,labels,assignees,milestone'
const VIEW_JSON = 'number,title,body,state,stateReason,author,createdAt,updatedAt,closedAt,url,labels,assignees,milestone,comments'

export default {
  tool: 'github_issue',
  title: 'Issues',
  description:
    'Issue tracking: create, list, view, status, comment, close (with ' +
    'reason), reopen, edit, and develop (create a linked branch). Structured ' +
    'JSON for list/view (trim with `jq`). Close reasons: completed / not_planned.',
  params: {
    repo: repoParam('Repository "owner/name" (defaults to config defaultRepo or the current directory\'s git remote).'),
    number: int('Issue number (view/comment/close/reopen/edit/develop).'),
    title: str('create: issue title; edit: new title.'),
    body: str('create/edit/comment: issue or comment body (Markdown).'),
    labels: strArr('create: label names.'),
    assignees: strArr('create: handles to assign ("@me" for yourself).'),
    milestone: str('create: milestone name.'),
    state: enumStr(['open', 'closed', 'all'], 'list: issue state filter (default open).'),
    search: str('list: GitHub search query to filter results.'),
    author: str('list: filter by author ("@me" for yourself).'),
    assignee: str('list: filter by assignee.'),
    limit: int('list: maximum results (default 30).'),
    reason: enumStr(['completed', 'not_planned'], 'close: close reason (defaults to completed).'),
    comment: str('close: optional closing comment.'),
    addLabels: strArr('edit: labels to add.'),
    removeLabels: strArr('edit: labels to remove.'),
    addAssignees: strArr('edit: handles to assign.'),
    baseBranch: str('develop: remote branch to base the new branch on (defaults to the default branch).'),
    branchName: str('develop: name of the branch to create (defaults to a gh-generated name).'),
    checkout: bool('develop: check out the branch locally after creating it (default true).'),
    jq: jqParam(),
  },
  actions: {
    create: {
      help: 'Create an issue (requires `title`; body/labels/assignees optional).',
      needs: ['title'],
      argv: (a) => {
        const argv = ['issue', 'create', '--title', a.title]
        if (a.body) argv.push('--body', a.body)
        for (const l of a.labels ?? []) argv.push('--label', l)
        for (const u of a.assignees ?? []) argv.push('--assignee', u)
        if (a.milestone) argv.push('--milestone', a.milestone)
        return argv
      },
    },
    list: {
      help: 'List issues (state/search/author/assignee filters, JSON output).',
      needs: [],
      json: LIST_JSON,
      argv: (a) => {
        const argv = ['issue', 'list']
        argv.push('--state', a.state ?? 'open')
        if (a.search) argv.push('--search', a.search)
        if (a.author) argv.push('--author', a.author)
        if (a.assignee) argv.push('--assignee', a.assignee)
        for (const l of a.labels ?? []) argv.push('--label', l)
        if (a.limit) argv.push('--limit', String(a.limit))
        return argv
      },
    },
    view: {
      help: 'Show one issue in full (body, labels, assignees, comment count) as JSON.',
      needs: ['number'],
      json: VIEW_JSON,
      argv: (a) => ['issue', 'view', String(a.number)],
    },
    status: {
      help: 'Show issues assigned to / created by / mentioning you in the current repo.',
      needs: [],
      argv: () => ['issue', 'status'],
    },
    comment: {
      help: 'Comment on an issue (requires `body`).',
      needs: ['number', 'body'],
      argv: (a) => ['issue', 'comment', String(a.number), '--body', a.body],
    },
    close: {
      help: 'Close an issue (optional `reason` and closing `comment`).',
      needs: ['number'],
      argv: (a) => {
        const argv = ['issue', 'close', String(a.number)]
        if (a.reason) argv.push('--reason', a.reason)
        if (a.comment) argv.push('--comment', a.comment)
        return argv
      },
    },
    reopen: {
      help: 'Reopen a closed issue.',
      needs: ['number'],
      argv: (a) => ['issue', 'reopen', String(a.number)],
    },
    edit: {
      help: 'Edit title/body/labels/assignees of an issue.',
      needs: ['number'],
      argv: (a) => {
        const argv = ['issue', 'edit', String(a.number)]
        if (a.title) argv.push('--title', a.title)
        if (a.body) argv.push('--body', a.body)
        for (const l of a.addLabels ?? []) argv.push('--add-label', l)
        for (const l of a.removeLabels ?? []) argv.push('--remove-label', l)
        for (const u of a.addAssignees ?? []) argv.push('--add-assignee', u)
        return argv
      },
    },
    develop: {
      help: 'Create a branch linked to the issue for working on it (optionally check it out).',
      needs: ['number'],
      argv: (a) => {
        const argv = ['issue', 'develop', String(a.number)]
        if (a.baseBranch) argv.push('--base', a.baseBranch)
        if (a.branchName) argv.push('--name', a.branchName)
        argv.push('--checkout', a.checkout === false ? 'false' : 'true')
        return argv
      },
    },
  },
}
