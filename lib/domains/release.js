/**
 * github_release — release management over `gh release`.
 */
import { str, enumStr, bool, int, strArr, repoParam, jqParam, confirmParam } from '../schema.js'

const VIEW_JSON = 'tagName,name,body,isDraft,isPrerelease,publishedAt,createdAt,url,assets,author,targetCommitish'

/** @type {import('../types.js').DomainDef} */
const domain = {
  tool: 'github_release',
  title: 'Releases',
  description:
    'Manage releases: create (with notes, generated notes, assets), list, ' +
    'view, upload/download assets, edit, delete. View returns structured ' +
    'JSON (trim with `jq`). Creating a release does NOT create the tag\'s ' +
    'commits — push those with git first.',
  params: {
    repo: repoParam('Repository "owner/name" (defaults to config defaultRepo or the current directory\'s git remote).'),
    tag: str('Release tag name (create/upload/download/edit/delete). view: omitted tag shows the latest release.'),
    title: str('create/edit: release title.'),
    notes: str('create/edit: release notes in Markdown.'),
    notesFromFile: str('create/edit: read release notes from this file path instead of the `notes` string.'),
    generateNotes: bool('create/edit: auto-generate release notes from commits via the GitHub API.'),
    target: str('create/edit: target branch or full commit SHA for the tag (defaults to the default branch).'),
    draft: bool('create/edit: save as draft (draft releases are only visible to collaborators).'),
    prerelease: bool('create/edit: mark as a prerelease.'),
    latest: bool('create/edit: explicitly mark (true) or unmark (false) as the "Latest" release.'),
    verifyTag: bool('create: abort when the git tag does not already exist on the remote.'),
    assets: strArr('create/upload: local file paths to attach as release assets.'),
    pattern: strArr('download: glob patterns of asset filenames to download.'),
    dir: str('download: directory to download into (default ".").'),
    output: str('download: write a single asset to this file ("-" for stdout).'),
    archive: enumStr(['zip', 'tar.gz'], 'download: download the source archive in this format instead of assets.'),
    clobber: bool('upload/download: overwrite existing assets/files of the same name.'),
    excludeDrafts: bool('list: exclude draft releases.'),
    excludePrereleases: bool('list: exclude prereleases.'),
    limit: int('list: maximum releases to list (default 30).'),
    cleanupTag: bool('delete: also delete the underlying git tag.'),
    jq: jqParam(),
    confirm: confirmParam(),
  },
  actions: {
    create: {
      help: 'Create a release for `tag` (requires notes, notesFromFile, or generateNotes; attach `assets`).',
      needs: ['tag'],
      check: (a) =>
        !a.notes && !a.notesFromFile && a.generateNotes !== true
          ? 'github_release create: provide `notes`, `notesFromFile`, or `generateNotes: true`.'
          : null,
      argv: (a) => {
        const argv = ['release', 'create', a.tag]
        for (const asset of a.assets ?? []) argv.push(asset)
        if (a.title) argv.push('--title', a.title)
        if (a.notes) argv.push('--notes', a.notes)
        if (a.notesFromFile) argv.push('--notes-file', a.notesFromFile)
        if (a.generateNotes === true) argv.push('--generate-notes')
        if (a.target) argv.push('--target', a.target)
        if (a.draft === true) argv.push('--draft')
        if (a.prerelease === true) argv.push('--prerelease')
        if (a.latest === true) argv.push('--latest')
        if (a.latest === false) argv.push('--latest=false')
        if (a.verifyTag) argv.push('--verify-tag')
        return argv
      },
    },
    list: {
      help: 'List releases of a repository.',
      needs: [],
      argv: (a) => {
        const argv = ['release', 'list']
        if (a.limit) argv.push('--limit', String(a.limit))
        if (a.excludeDrafts) argv.push('--exclude-drafts')
        if (a.excludePrereleases) argv.push('--exclude-pre-releases')
        return argv
      },
    },
    view: {
      help: 'Show a release in full as JSON (omitted `tag` shows the latest release).',
      needs: [],
      json: VIEW_JSON,
      argv: (a) => {
        const argv = ['release', 'view']
        if (a.tag) argv.push(a.tag)
        return argv
      },
    },
    upload: {
      help: 'Upload files as assets to an existing release (requires `tag` and `assets`).',
      needs: ['tag', 'assets'],
      argv: (a) => {
        const argv = ['release', 'upload', a.tag, ...a.assets]
        if (a.clobber) argv.push('--clobber')
        return argv
      },
    },
    download: {
      help: 'Download release assets (requires `tag`; filter with `pattern`, or fetch the source `archive`).',
      needs: ['tag'],
      argv: (a) => {
        const argv = ['release', 'download', a.tag]
        for (const p of a.pattern ?? []) argv.push('--pattern', p)
        if (a.dir) argv.push('--dir', a.dir)
        if (a.output) argv.push('--output', a.output)
        if (a.archive) argv.push('--archive', a.archive)
        if (a.clobber) argv.push('--clobber')
        return argv
      },
    },
    edit: {
      help: 'Edit a release (title/notes/draft/prerelease/latest/target; booleans set explicitly).',
      needs: ['tag'],
      argv: (a) => {
        const argv = ['release', 'edit', a.tag]
        if (a.title) argv.push('--title', a.title)
        if (a.notes) argv.push('--notes', a.notes)
        if (a.notesFromFile) argv.push('--notes-file', a.notesFromFile)
        if (a.generateNotes === true) argv.push('--generate-notes')
        if (a.draft === true) argv.push('--draft')
        if (a.draft === false) argv.push('--draft=false')
        if (a.prerelease === true) argv.push('--prerelease')
        if (a.prerelease === false) argv.push('--prerelease=false')
        if (a.latest === true) argv.push('--latest')
        if (a.latest === false) argv.push('--latest=false')
        if (a.target) argv.push('--target', a.target)
        return argv
      },
    },
    delete: {
      help: 'DESTRUCTIVE: delete a release (optionally its tag too via cleanupTag).',
      needs: ['tag'],
      destructive: true,
      argv: (a) => {
        const argv = ['release', 'delete', a.tag, '--yes']
        if (a.cleanupTag) argv.push('--cleanup-tag')
        return argv
      },
    },
  },
}

export default domain
