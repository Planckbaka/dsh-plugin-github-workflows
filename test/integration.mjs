/**
 * Hermetic integration test: the full registry pipeline (index.apply →
 * domain tables → gates → argv/json/jq/timeout injection → routing)
 * exercised against a FAKE runner that records calls and never spawns.
 *
 * Every check is a hard assertion; the process exits non-zero on any
 * failure. Real gh/git subprocess coverage lives in selfcheck.mjs.
 *
 * Usage: npm run test:integration
 */

let failures = 0
let checks = 0
function check(name, condition, detail = '') {
  checks++
  if (condition) {
    console.log(`  ✓ ${name}`)
  } else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}
function includesAll(haystack, needles) {
  return needles.every((n) => haystack.includes(n))
}

/** Build a recording fake runner (implements lib/types.js Runner). */
function makeFakeRunner() {
  const calls = []
  const ok = (argv) => ({
    ok: true, exitCode: 0, signal: '', timedOut: false, durationMs: 5,
    command: `gh ${argv.join(' ')}`, stdout: '', stderr: '',
    truncated: false, spillPath: '',
  })
  const runner = {
    async run(argv, options = {}) { calls.push({ bin: 'gh', argv: [...argv], options }); return ok(argv) },
    async runGit(argv, options = {}) { calls.push({ bin: 'git', argv: [...argv], options }); return ok(argv) },
    async probe() { return { available: true, version: 'gh version test (fake)' } },
    async authInfo() { return { ghAuthenticated: true, gitCredentialFallback: false } },
  }
  return {
    runner,
    calls,
    last(bin = 'gh') {
      const call = [...calls].reverse().find((c) => c.bin === bin)
      if (!call) throw new Error(`no ${bin} call recorded`)
      return call
    },
    count: () => calls.length,
  }
}

/** Minimal fake ctx: captures registered tool definitions. */
function makeCtx() {
  const registered = []
  return {
    registered,
    tools: { register: (def) => registered.push(def) },
    logger: { info: () => {}, warn: () => {} },
    effect: () => {},
  }
}

const { apply } = await import('../lib/index.js')

console.log('\n[1] Registration (allowRaw: false)')
{
  const fake = makeFakeRunner()
  const ctx = makeCtx()
  apply(ctx, { defaultRepo: 'owner/knock', timeoutMs: 15_000, watchTimeoutMs: 120_000 }, fake.runner)
  const names = ctx.registered.map((t) => t.name).sort()
  check('exactly 11 tools registered', names.length === 11, `got ${names.length}: ${names.join(',')}`)
  check('github_cli gated off', !names.includes('github_cli'))
  check('every tool has parameters + output + execute + presentCall',
    ctx.registered.every((t) => t.parameters && t.output?.schema && t.output?.render && typeof t.execute === 'function' && typeof t.presentCall === 'function'))
  check('every parameters schema is a strict object root',
    ctx.registered.every((t) => t.parameters.type === 'object' && t.parameters.additionalProperties === false && t.parameters.properties.action))
}

console.log('\n[2] Registration (allowRaw: true)')
let rawCtx
let rawFake
{
  rawFake = makeFakeRunner()
  rawCtx = makeCtx()
  apply(rawCtx, { allowRaw: true, defaultRepo: 'owner/knock', timeoutMs: 15_000, watchTimeoutMs: 120_000 }, rawFake.runner)
  check('12 tools with github_cli', rawCtx.registered.length === 12 && rawCtx.registered.some((t) => t.name === 'github_cli'))
}

const byName = Object.fromEntries(rawCtx.registered.map((t) => [t.name, t]))
const pr = byName.github_pr
const actionsTool = byName.github_actions
const gitTool = byName.github_git
const commitTool = byName.github_commit
const apiTool = byName.github_api
const cliTool = byName.github_cli
const releaseTool = byName.github_release
const authTool = byName.github_auth

console.log('\n[3] Safety gates reject before any subprocess')
{
  rawFake.calls.length = 0
  let r = await pr.execute({ action: 'merge', number: 5, mergeMethod: 'squash' }, {})
  check('merge without confirm rejected', r.ok === false && /confirm: true/.test(r.stderr))
  check('merge rejection made no runner call', rawFake.count() === 0, `${rawFake.count()} calls`)

  const strictCtx = makeCtx()
  const strictFake = makeFakeRunner()
  apply(strictCtx, { allowDestructive: false, defaultRepo: 'owner/knock' }, strictFake.runner)
  const strictPr = strictCtx.registered.find((t) => t.name === 'github_pr')
  r = await strictPr.execute({ action: 'merge', number: 5, confirm: true }, {})
  check('allowDestructive:false blocks confirmed merge', r.ok === false && /allowDestructive/.test(r.stderr))

  r = await pr.execute({ action: 'view' }, {})
  check('missing required param rejected', r.ok === false && /requires parameter `number`/.test(r.stderr))

  r = await pr.execute({ action: 'create', body: 'x' }, {})
  check('check() rejects PR create without title/fill', r.ok === false && /title/.test(r.stderr))

  const bareCtx = makeCtx()
  apply(bareCtx, {}, makeFakeRunner().runner)
  const bareCommit = bareCtx.registered.find((t) => t.name === 'github_commit')
  r = await bareCommit.execute({ action: 'list' }, {})
  check('requiresRepo rejects without repo/defaultRepo', r.ok === false && /defaultRepo/.test(r.stderr))

  r = await releaseTool.execute({ action: 'create', tag: 'v1' }, {})
  check('release create without notes rejected', r.ok === false && /generateNotes/.test(r.stderr))

  r = await apiTool.execute({ action: 'request', path: 'x', fields: ['no-equals-sign'] }, {})
  check('api malformed field rejected', r.ok === false && /key=value/.test(r.stderr))
}

console.log('\n[4] argv / --json / --jq / --repo injection')
{
  rawFake.calls.length = 0
  await pr.execute({ action: 'list', state: 'open', limit: 3 }, {})
  const call = rawFake.last()
  check('pr list argv has state/limit',
    call.argv.includes('--state') && call.argv.includes('open') && call.argv.includes('--limit') && call.argv.includes('3'))
  check('defaultRepo injected via --repo', includesAll(call.argv, ['--repo', 'owner/knock']))
  check('--json fields injected', call.argv.includes('--json') && call.argv[call.argv.indexOf('--json') + 1].includes('number'))
  check('no --jq without jq arg', !call.argv.includes('--jq'))

  rawFake.calls.length = 0
  await pr.execute({ action: 'list', jq: '.[] | .number' }, {})
  check('caller jq injected after --json', includesAll(rawFake.last().argv, ['--jq', '.[] | .number']))

  rawFake.calls.length = 0
  await commitTool.execute({ action: 'list', limit: 5, repo: 'owner/knock' }, {})
  const commitCall = rawFake.last()
  check('commit list goes through gh api', includesAll(commitCall.argv, ['api', '-X', 'GET', 'repos/owner/knock/commits']))
  check('commit list injects default jq', commitCall.argv.includes('--jq') && commitCall.argv[commitCall.argv.indexOf('--jq') + 1].startsWith('[.[]'))

  rawFake.calls.length = 0
  await actionsTool.execute({ action: 'run_view', runId: 42, log: true }, {})
  const logCall = rawFake.last()
  check('run_view log:true drops --json but keeps --log', logCall.argv.includes('--log') && !logCall.argv.includes('--json'))
}

console.log('\n[5] Timeout routing and binary routing')
{
  rawFake.calls.length = 0
  await actionsTool.execute({ action: 'run_watch', runId: 42 }, {})
  check('watch action uses watchTimeoutMs', rawFake.last().options.timeoutMs === 120_000, `got ${rawFake.last().options.timeoutMs}`)

  rawFake.calls.length = 0
  await pr.execute({ action: 'list' }, {})
  check('normal action uses timeoutMs', rawFake.last().options.timeoutMs === 15_000, `got ${rawFake.last().options.timeoutMs}`)

  rawFake.calls.length = 0
  await pr.execute({ action: 'list', timeoutMs: 45_000 }, {})
  check('per-call timeoutMs overrides', rawFake.last().options.timeoutMs === 45_000)

  rawFake.calls.length = 0
  await gitTool.execute({ action: 'status' }, {})
  check('github_git routed to the git binary', rawFake.last('git').bin === 'git' && rawFake.last('git').argv[0] === 'status')

  rawFake.calls.length = 0
  await pr.execute({ action: 'list' }, {})
  check('gh tool routed to the gh binary', rawFake.last().bin === 'gh' && rawFake.last().argv[0] === 'pr')
}

console.log('\n[6] Raw passthrough gating (github_cli)')
{
  rawFake.calls.length = 0
  let r = await cliTool.execute({ action: 'run', args: ['gist', 'list'] }, {})
  check('allowed raw command executes', r.ok === true && rawFake.last().argv[0] === 'gist')

  r = await cliTool.execute({ action: 'run', args: ['auth', 'login'] }, {})
  check('interactive auth login blocked', r.ok === false && /github_auth/.test(r.stderr))

  r = await cliTool.execute({ action: 'run', args: ['repo', 'view', '--web'] }, {})
  check('--web browser flag blocked', r.ok === false && /interactive\/browser/.test(r.stderr))

  r = await cliTool.execute({ action: 'run', args: ['browse'] }, {})
  check('browse blocked', r.ok === false)
}

console.log('\n[7] Presentation: render + secret sanitization')
{
  const text = pr.output.render({}, {
    command: 'gh pr view 1', stdout: 'hello', stderr: 'warn', ok: false,
    exitCode: 1, durationMs: 1200, truncated: true, spillPath: 'C:/t/spill.log',
  })[0].text
  check('render shows command/stdout/stderr/exit/truncation',
    includesAll(text, ['$ gh pr view 1', 'hello', '[stderr]', '✗ exit 1', 'spill file']))

  const card = authTool.presentCall({ action: 'setup', token: 'ghp_supersecret' })
  check('presentCall masks token', card.rawInput.token === '***' && !JSON.stringify(card).includes('ghp_supersecret'))

  const cardOk = authTool.presentCall({ action: 'status' })
  check('presentCall card shape', cardOk.card === 'generic' && cardOk.kind === 'other' && cardOk.title.includes('auth'))
}

console.log('\n[8] Config merge defaults')
{
  const ctx = makeCtx()
  apply(ctx, {}, makeFakeRunner().runner)
  check('empty config accepted (defaults applied)', ctx.registered.length === 11)
}

console.log(`\n${failures === 0 ? `ALL ${checks} INTEGRATION CHECKS PASSED` : `${failures}/${checks} INTEGRATION CHECKS FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
