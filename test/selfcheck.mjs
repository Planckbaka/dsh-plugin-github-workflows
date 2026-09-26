/**
 * Offline self-check for dsh-plugin-github (run with any Node >= 18):
 *   1. every JSON Schema uses only the dsh-tools-enforced subset keywords;
 *   2. every domain declares well-formed actions (needs reference params,
 *      argv builders return string arrays or { error });
 *   3. argv builders run against synthesized args of the declared types;
 *   4. the gh runner executes real read-only commands and returns the
 *      unified result shape.
 *
 * Usage: node test/selfcheck.mjs
 */
import { createRunner } from '../lib/gh.js'
import { RESULT_SCHEMA } from '../lib/schema.js'

import auth from '../lib/domains/auth.js'
import repo from '../lib/domains/repo.js'
import issue from '../lib/domains/issue.js'
import pr from '../lib/domains/pr.js'
import commit from '../lib/domains/commit.js'
import release from '../lib/domains/release.js'
import actions from '../lib/domains/actions.js'
import codespace from '../lib/domains/codespace.js'
import search from '../lib/domains/search.js'
import api from '../lib/domains/api.js'
import cli from '../lib/domains/cli.js'
import git from '../lib/domains/git.js'

const DOMAINS = [auth, repo, pr, issue, commit, release, actions, codespace, search, api, cli, git]

const ALLOWED = new Set([
  'type', 'oneOf', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'const',
  'description', 'title', 'default', 'examples',
])
const TYPES = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'])

let failures = 0
const fail = (msg) => { failures++; console.error('  ✗ ' + msg) }
const pass = (msg) => console.log('  ✓ ' + msg)

function checkSchema(node, path) {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return
  for (const key of Object.keys(node)) {
    if (!ALLOWED.has(key)) fail(`${path}: disallowed keyword "${key}"`)
  }
  if ('type' in node) {
    if (!TYPES.has(node.type)) fail(`${path}: unknown type "${node.type}"`)
    if (Array.isArray(node.type)) fail(`${path}: type unions must use oneOf`)
  }
  if (typeof node.properties === 'object' && node.properties !== null) {
    for (const [name, sub] of Object.entries(node.properties)) {
      if (typeof sub !== 'object' || sub === null) { fail(`${path}.properties.${name}: not an object`); continue }
      checkSchema(sub, `${path}.properties.${name}`)
    }
  }
  if (node.items) checkSchema(node.items, `${path}.items`)
  if (Array.isArray(node.oneOf)) node.oneOf.forEach((sub, i) => checkSchema(sub, `${path}.oneOf[${i}]`))
}

function sampleValue(schema) {
  if (schema.enum && schema.enum.length > 0) return schema.enum[0]
  switch (schema.type) {
    case 'string': return 'sample'
    case 'integer': return 1
    case 'number': return 1.5
    case 'boolean': return true
    case 'array': return ['sample']
    case 'null': return null
    case 'object': return {}
    default: return 'sample'
  }
}

function sampleArgs(domain) {
  const args = {}
  for (const [name, schema] of Object.entries(domain.params)) {
    let value = sampleValue(schema)
    // richer samples for a few known params so validation paths get exercised
    if (name === 'inputs' || name === 'fields' || name === 'jsonFields' || name === 'headers') value = ['key=value']
    if (name === 'diffFormat') value = 'patch'
    if (name === 'reason') value = 'completed'
    if (name === 'reviewType') value = 'approve'
    if (name === 'mergeMethod') value = 'squash'
    if (name === 'method') value = 'GET'
    if (name === 'state') value = 'all'
    if (name === 'visibility') value = 'private'
    if (name === 'archive') value = 'zip'
    if (name === 'args') value = ['gist', 'list']
    args[name] = value
  }
  return args
}

console.log('\n[1] JSON Schema subset compliance')
for (const domain of DOMAINS) {
  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      action: { type: 'string', enum: Object.keys(domain.actions) },
      ...domain.params,
      timeoutMs: { type: 'integer', description: 'x' },
    },
    required: ['action'],
  }
  checkSchema(schema, `${domain.tool}.parameters`)
}
checkSchema(RESULT_SCHEMA, 'RESULT_SCHEMA')
pass(`schema subset OK for ${DOMAINS.length} domains + result schema`)

console.log('\n[2] Domain shape')
for (const domain of DOMAINS) {
  if (!domain.tool?.startsWith('github_')) fail(`${domain.tool}: tool name must start with github_`)
  const keys = Object.keys(domain.actions)
  if (keys.length === 0) fail(`${domain.tool}: no actions`)
  for (const [name, action] of Object.entries(domain.actions)) {
    if (typeof action.argv !== 'function') fail(`${domain.tool}.${name}: argv must be a function`)
    if (typeof action.help !== 'string') fail(`${domain.tool}.${name}: help must be a string`)
    for (const need of action.needs ?? []) {
      if (!(need in domain.params)) fail(`${domain.tool}.${name}: needs "${need}" but no such param`)
    }
    if (action.check && typeof action.check !== 'function') fail(`${domain.tool}.${name}: check must be a function`)
  }
}
pass('domain shapes OK')

console.log('\n[3] argv builders vs synthesized args')
let builtCommands = 0
for (const domain of DOMAINS) {
  for (const [name, action] of Object.entries(domain.actions)) {
    const args = { action: name, ...sampleArgs(domain), ...(domain.gated ? { args: ['gist', 'list'] } : {}) }
    let out
    try {
      out = action.argv(args, { defaultRepo: 'owner/knock', timeoutMs: 60000 }, 'owner/knock')
    } catch (error) {
      fail(`${domain.tool}.${name}: argv threw ${error.message}`)
      continue
    }
    if (out && typeof out === 'object' && !Array.isArray(out)) {
      if (typeof out.error !== 'string') fail(`${domain.tool}.${name}: argv error object lacks string error`)
      continue
    }
    if (!Array.isArray(out) || out.length === 0) { fail(`${domain.tool}.${name}: argv returned non-array/empty`); continue }
    if (!out.every((p) => typeof p === 'string')) fail(`${domain.tool}.${name}: argv entries must all be strings`)
    builtCommands++
  }
}
pass(`argv built ${builtCommands} command lines without errors`)

console.log('\n[4] check() validators')
const prCreateNoTitle = pr.actions.create.check({ body: 'x' })
if (prCreateNoTitle === null) fail('pr.create.check should reject missing title without fill')
else pass(`pr.create.check rejects: ${prCreateNoTitle}`)
const relCreateOk = release.actions.create.check({ tag: 'v1', generateNotes: true })
if (relCreateOk !== null) fail(`release.create.check should accept generateNotes: ${relCreateOk}`)
else pass('release.create.check accepts generateNotes')

console.log('\n[5] gh runner end-to-end (read-only)')
const runner = createRunner({
  ghPath: '', gitPath: '', defaultRepo: '', timeoutMs: 15000, watchTimeoutMs: 30000,
  maxOutputBytes: 4096, allowRaw: false, allowDestructive: true, env: {},
})
const version = await runner.run(['--version'], {})
if (!version.ok || !version.stdout.includes('gh version')) fail('gh --version failed: ' + version.stderr)
else pass(`gh --version → ${version.stdout.split('\n')[0]} (data? ${'data' in version})`)
if (version.command.startsWith('gh --version') !== true) fail('command display malformed')

const authStatus = await runner.run(['auth', 'status'], {})
console.log(`    gh auth status → ok=${authStatus.ok} exit=${authStatus.exitCode} (${authStatus.stderr.split('\n')[0].slice(0, 80)})`)
if (authStatus.exitCode !== 0 && authStatus.exitCode !== 4 && authStatus.exitCode !== 1) {
  fail('unexpected auth status exit code ' + authStatus.exitCode)
}

const missing = await runner.run(['definitely', 'not-a-command'], {})
if (missing.ok) fail('unknown command should fail')
else pass(`unknown command → exit ${missing.exitCode}, stderr captured (${missing.stderr.length} chars)`)

console.log('\n[6] git runner + credential fallback')
const gitVersion = await runner.runGit(['--version'], {})
if (!gitVersion.ok || !gitVersion.stdout.includes('git version')) fail('git --version failed: ' + gitVersion.stderr)
else pass(`git --version → ${gitVersion.stdout.split('\n')[0].trim()}`)
const authState = await runner.authInfo()
console.log(`    authInfo → ghAuthenticated=${authState.ghAuthenticated} gitCredentialFallback=${authState.gitCredentialFallback}`)
if (typeof authState.ghAuthenticated !== 'boolean') fail('authInfo.ghAuthenticated must be boolean')
if (authState.gitCredentialFallback && authState.ghAuthenticated) fail('fallback and ghAuthenticated are mutually exclusive')
else pass('auth fallback chain resolves consistently')

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' FAILURES'}`)
process.exit(failures === 0 ? 0 : 1)
