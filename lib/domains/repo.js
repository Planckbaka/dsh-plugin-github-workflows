/**
 * github_repo — repository management over `gh repo`.
 */
import { str, enumStr, bool, int, strArr, repoParam, jqParam, confirmParam } from '../schema.js'

export default {
  tool: 'github_repo',
  title: 'Repositories',
  description:
    'Manage GitHub repositories: view, list, create, clone, fork, edit, ' +
    'sync, rename, archive and delete. View/list return structured JSON ' +
    '(trim with `jq`). Creating and pushing LOCAL commits is a git concern — ' +
    'use the shell for git commit/push and this tool for the GitHub side.',
  params: {
    repo: repoParam(
      'Target repository as "owner/name" (create/list/fork use their own ' +
        'positional names; this selects the repository for the other actions).',
    ),
    name: str(
      'create: new repository name ("name" or "owner/name" to create in an org); ' +
        'rename: the new repository name.',
    ),
    owner: str('list: repository owner whose repositories to list (defaults to the logged-in user).'),
    visibility: enumStr(
      ['public', 'private', 'internal'],
      'create: repository visibility (defaults to private). edit: changes visibility (requires confirm).',
    ),
    description: str('create/edit: repository description.'),
    homepage: str('create/edit: repository home page URL.'),
    license: str('create: Open Source license to initialize with, e.g. "mit".'),
    gitignore: str('create: gitignore template name, e.g. "Node".'),
    readme: bool('create: initialize the repository with a README.'),
    clone: bool('create/fork: also clone the result to the current directory.'),
    dir: str('clone: target directory (defaults to the repository name).'),
    defaultBranch: str('edit: set the default branch name.'),
    addTopics: strArr('edit: repository topics to add.'),
    removeTopics: strArr('edit: repository topics to remove.'),
    source: str('sync: source repository ("owner/name") that dest is synced from.'),
    branch: str('sync: branch to sync (defaults to the default branch).'),
    force: bool('sync: hard-reset the destination branch to match the source.'),
    limit: int('list: maximum repositories to return (default 30).'),
    jq: jqParam(),
    confirm: confirmParam(),
  },
  actions: {
    view: {
      help: 'Show repository details as JSON (description, branches, topics, stats).',
      needs: [],
      json: 'name,owner,description,visibility,isPrivate,isArchived,isFork,defaultBranchRef,url,homepageUrl,forkCount,stargazerCount,primaryLanguage,licenseInfo,createdAt,updatedAt,pushedAt,repositoryTopics',
      argv: (a, cfg) => {
        const target = a.repo ?? cfg.defaultRepo
        const argv = ['repo', 'view']
        if (target) argv.push(target)
        return argv
      },
    },
    list: {
      help: "List a user's or organization's repositories.",
      needs: [],
      json: 'nameWithOwner,description,visibility,isPrivate,isArchived,isFork,updatedAt,url,primaryLanguage,stargazerCount',
      argv: (a) => {
        const argv = ['repo', 'list']
        if (a.owner) argv.push(a.owner)
        if (a.limit) argv.push('--limit', String(a.limit))
        return argv
      },
    },
    create: {
      help: 'Create a new repository (requires `name`; private by default).',
      needs: ['name'],
      argv: (a) => {
        const argv = ['repo', 'create', a.name]
        const v = a.visibility ?? 'private'
        argv.push(`--${v}`)
        if (a.description) argv.push('--description', a.description)
        if (a.homepage) argv.push('--homepage', a.homepage)
        if (a.license) argv.push('--license', a.license)
        if (a.gitignore) argv.push('--gitignore', a.gitignore)
        if (a.readme) argv.push('--add-readme')
        if (a.clone) argv.push('--clone')
        return argv
      },
    },
    clone: {
      help: 'Clone a repository locally (requires `repo`).',
      needs: ['repo'],
      argv: (a) => {
        const argv = ['repo', 'clone', a.repo]
        if (a.dir) argv.push(a.dir)
        return argv
      },
    },
    fork: {
      help: 'Fork a repository (requires `repo`).',
      needs: ['repo'],
      argv: (a) => {
        const argv = ['repo', 'fork', a.repo]
        if (a.clone) argv.push('--clone')
        return argv
      },
    },
    edit: {
      help: 'Edit repository metadata (description, homepage, default branch, topics; visibility change needs confirm).',
      needs: [],
      argv: (a, cfg) => {
        const target = a.repo ?? cfg.defaultRepo
        if (!target) return { error: 'github_repo edit: `repo` (or config defaultRepo) is required.' }
        const argv = ['repo', 'edit', target]
        if (a.description) argv.push('--description', a.description)
        if (a.homepage) argv.push('--homepage', a.homepage)
        if (a.defaultBranch) argv.push('--default-branch', a.defaultBranch)
        for (const topic of a.addTopics ?? []) argv.push('--add-topic', topic)
        for (const topic of a.removeTopics ?? []) argv.push('--remove-topic', topic)
        if (a.visibility) {
          if (a.confirm !== true) {
            return { error: 'github_repo edit: changing visibility is destructive — set confirm: true.' }
          }
          argv.push('--visibility', a.visibility, '--accept-visibility-change-consequences')
        }
        return argv
      },
    },
    sync: {
      help: 'Sync (fast-forward) a fork from its upstream or `source` repo.',
      needs: [],
      argv: (a, cfg) => {
        const dest = a.repo ?? cfg.defaultRepo
        if (!dest) return { error: 'github_repo sync: `repo` (or config defaultRepo) is required.' }
        const argv = ['repo', 'sync', dest]
        if (a.source) argv.push('--source', a.source)
        if (a.branch) argv.push('--branch', a.branch)
        if (a.force) {
          if (a.confirm !== true) return { error: 'github_repo sync: --force hard-resets the destination branch — set confirm: true.' }
          argv.push('--force')
        }
        return argv
      },
    },
    rename: {
      help: 'Rename a repository (requires `name` as the new name and `repo`).',
      needs: ['name'],
      destructive: true,
      argv: (a, cfg) => {
        const target = a.repo ?? cfg.defaultRepo
        if (!target) return { error: 'github_repo rename: `repo` (or config defaultRepo) is required.' }
        return ['repo', 'rename', a.name, '--repo', target, '--yes']
      },
    },
    archive: {
      help: 'Archive a repository (read-only afterwards; reversible via unarchive).',
      destructive: true,
      argv: (a, cfg) => {
        const target = a.repo ?? cfg.defaultRepo
        if (!target) return { error: 'github_repo archive: `repo` (or config defaultRepo) is required.' }
        return ['repo', 'archive', target, '--yes']
      },
    },
    unarchive: {
      help: 'Unarchive a previously archived repository.',
      argv: (a, cfg) => {
        const target = a.repo ?? cfg.defaultRepo
        if (!target) return { error: 'github_repo unarchive: `repo` (or config defaultRepo) is required.' }
        return ['repo', 'unarchive', target, '--yes']
      },
    },
    delete: {
      help: 'PERMANENTLY delete a repository. Irreversible.',
      destructive: true,
      argv: (a, cfg) => {
        const target = a.repo ?? cfg.defaultRepo
        if (!target) return { error: 'github_repo delete: `repo` (or config defaultRepo) is required.' }
        return ['repo', 'delete', target, '--yes']
      },
    },
  },
}
