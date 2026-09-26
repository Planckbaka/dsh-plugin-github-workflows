import { createRunner } from '../lib/gh.js'

// Minimal fakes: capture registered tool definitions, no DSH needed.
const registered = []
const ctx = {
  tools: { register: (def) => registered.push(def) },
  logger: { info: () => {}, warn: () => {} },
  effect: () => {},
}
const { apply } = await import('../lib/index.js')
apply(ctx, { defaultRepo: 'octocat/hello-world', timeoutMs: 15000 })

console.log('registered tools:', registered.map((t) => t.name).join(', '))
const byName = Object.fromEntries(registered.map((t) => [t.name, t]))
const gh = byName.github_pr
const ra = byName.github_actions

// 1. destructive gate
let r = await gh.execute({ action: 'merge', number: 5, mergeMethod: 'squash' }, {})
console.log('merge w/o confirm →', r.ok, '|', r.stderr.slice(0, 70))

// 2. with confirm (repo unknown but command still runs; expected gh failure)
r = await gh.execute({ action: 'merge', number: 5, mergeMethod: 'squash', confirm: true, repo: 'octocat/hello-world' }, {})
console.log('merge w/ confirm →', r.ok, 'exit', r.exitCode, '| hint:', r.stderr.includes('[hint]') ? 'auth hint appended' : r.stderr.split('\n')[0].slice(0, 60))

// 3. json + repo flag injection (dry command line shown in result.command)
r = await gh.execute({ action: 'list', state: 'open', limit: 3 }, {})
console.log('pr list cmd →', r.command)

// 4. jq injection
r = await gh.execute({ action: 'list', jq: '.[] | .number' }, {})
console.log('pr list+jq →', r.command)

// 5. actions run_watch uses watch timeout (can't easily verify without running; check command)
r = await ra.execute({ action: 'run_list', limit: 2 }, {})
console.log('run list cmd →', r.command)

// 6. auth status through github_auth tool
const au = byName.github_auth
r = await au.execute({ action: 'status' }, {})
console.log('auth status →', r.ok, 'exit', r.exitCode, '|', r.stderr.split('\n')[0].slice(0, 60))

// 7. missing param
r = await gh.execute({ action: 'view' }, {})
console.log('view w/o number →', r.stderr)

// 8. commit tool repo requirement
const cm = byName.github_commit
r = await cm.execute({ action: 'list' }, {})
console.log('commit list w/o repo →', r.stderr.slice(0, 80))

// 9. gated tool absent
console.log('github_cli registered?', byName.github_cli !== undefined)

// 10. render text shape
const text = gh.output.render({}, { command: 'gh pr view 1', stdout: 'x', stderr: '', ok: true, exitCode: 0, durationMs: 1200, truncated: false, spillPath: '' })
console.log('render →', JSON.stringify(text[0].text))
