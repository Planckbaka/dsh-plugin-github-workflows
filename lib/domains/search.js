/**
 * github_search — GitHub search over `gh search` (repos, issues, prs, code, commits).
 */
import { str, int, jqParam } from '../schema.js'

/** @type {import('../types.js').DomainDef} */
const domain = {
  tool: 'github_search',
  title: 'Search',
  description:
    'Search GitHub: repositories, issues, pull requests, code, and commits ' +
    'with GitHub search syntax (e.g. "repo:owner/name is:open bug", ' +
    '"language:typescript stars:>1000"). Structured JSON output (trim with `jq`).',
  params: {
    query: str('GitHub search query (qualifiers supported), e.g. "repo:octocat/hello-world is:pr is:open".'),
    limit: int('Maximum results (default 30).'),
    jq: jqParam(),
  },
  actions: {
    repos: {
      help: 'Search repositories (e.g. "language:go stars:>5000").',
      needs: ['query'],
      json: 'fullName,description,stargazersCount,language,updatedAt,url,visibility,isPrivate,isFork,isArchived',
      argv: (a) => {
        const argv = ['search', 'repos', a.query]
        if (a.limit) argv.push('--limit', String(a.limit))
        return argv
      },
    },
    issues: {
      help: 'Search issues (e.g. "repo:owner/name is:open label:bug").',
      needs: ['query'],
      json: 'number,title,state,url,repository,updatedAt,createdAt,author,labels',
      argv: (a) => {
        const argv = ['search', 'issues', a.query]
        if (a.limit) argv.push('--limit', String(a.limit))
        return argv
      },
    },
    prs: {
      help: 'Search pull requests (e.g. "author:@me is:open review:approved").',
      needs: ['query'],
      json: 'number,title,state,url,repository,updatedAt,createdAt,author,labels,isDraft',
      argv: (a) => {
        const argv = ['search', 'prs', a.query]
        if (a.limit) argv.push('--limit', String(a.limit))
        return argv
      },
    },
    code: {
      help: 'Search code (e.g. "repofind language:js TODO").',
      needs: ['query'],
      json: 'path,repository,url',
      argv: (a) => {
        const argv = ['search', 'code', a.query]
        if (a.limit) argv.push('--limit', String(a.limit))
        return argv
      },
    },
    commits: {
      help: 'Search commits (e.g. "repo:torvalds/linux author:Linus fix").',
      needs: ['query'],
      json: false,
      argv: (a) => {
        const argv = ['search', 'commits', a.query]
        if (a.limit) argv.push('--limit', String(a.limit))
        return argv
      },
    },
  },
}

export default domain
