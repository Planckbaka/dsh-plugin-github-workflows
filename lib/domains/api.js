/**
 * github_api — authenticated raw GitHub REST/GraphQL access via `gh api`.
 *
 * The escape hatch for everything the domain tools do not cover: projects,
 * gists, orgs, milestones, labels, deployments, webhooks... GET parameters
 * are passed as key=value strings and become query parameters; for other
 * methods they become the request body.
 */
import { str, enumStr, bool, strArr } from '../schema.js'

export default {
  tool: 'github_api',
  title: 'GitHub REST API',
  description:
    'Make any authenticated GitHub API request through gh (REST path like ' +
    '"repos/owner/repo/pulls" or a GraphQL "graphql" call). Use it for ' +
    'resources the dedicated tools do not cover: labels, milestones, ' +
    'projects, gists, orgs, deployments, webhooks... ' +
    '`fields` are key=value strings sent as string parameters (-f); ' +
    '`jsonFields` use typed values with JSON parsing (-F, e.g. ' +
    '"state=\\"open\\"" or numbers/booleans).',
  params: {
    method: enumStr(['GET', 'POST', 'PATCH', 'PUT', 'DELETE'], 'HTTP method (default GET).'),
    path: str('API path (e.g. "repos/owner/repo/labels") or "graphql".'),
    fields: strArr('String parameters as key=value strings ("title=Fix bug"); GET → query params, others → form body.'),
    jsonFields: strArr('Typed parameters as key=value strings parsed as JSON (-F): numbers, booleans, arrays, strings-with-quotes.'),
    headers: strArr('Extra request headers as key:value strings, e.g. ["Accept: application/vnd.github+json"].'),
    input: str('File whose full content is the request body (use "-" for stdin-free raw JSON body file).'),
    jq: str('jq expression applied to the response (--jq), e.g. ".[] | .name".'),
    paginate: bool('Fetch all pages of a paginated endpoint (--paginate; combine with slurp=true to merge into one array).'),
    verbose: bool('Include full HTTP request/response in the output (debugging).'),
  },
  actions: {
    request: {
      help: 'Execute one API request (requires `path`).',
      needs: ['path'],
      argv: (a) => {
        const argv = ['api', '-X', a.method ?? 'GET', a.path]
        for (const field of a.fields ?? []) {
          const eq = field.indexOf('=')
          if (eq <= 0) return { error: `github_api: fields must be key=value strings, got ${JSON.stringify(field)}` }
          argv.push('--raw-field', field)
        }
        for (const field of a.jsonFields ?? []) {
          const eq = field.indexOf('=')
          if (eq <= 0) return { error: `github_api: jsonFields must be key=value strings, got ${JSON.stringify(field)}` }
          argv.push('--field', field)
        }
        for (const header of a.headers ?? []) {
          const colon = header.indexOf(':')
          if (colon <= 0) return { error: `github_api: headers must be key:value strings, got ${JSON.stringify(header)}` }
          argv.push('--header', header)
        }
        if (a.input) argv.push('--input', a.input)
        if (a.paginate) argv.push('--paginate', '--slurp')
        if (a.verbose) argv.push('--verbose')
        return argv
      },
    },
  },
}
