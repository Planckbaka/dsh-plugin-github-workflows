/**
 * Domain-table driven tool registration.
 *
 * Every github_* tool is generated from its lib/domains/*.js definition:
 * one `action` enum parameter selects the gh subcommand; the definition's
 * argv() maps typed parameters to a gh argument array (never a shell
 * string). Gates applied here for every domain:
 *   1. schema — closed action enum + typed parameters (registry-enforced)
 *   2. needs/check — per-action required parameters and custom validation
 *   3. destructive — confirm: true required AND config allowDestructive
 *   4. timeouts — watch actions use watchTimeoutMs; args.timeoutMs overrides
 * Repository selection, --json field defaults, and default jq filters are
 * injected uniformly from the action table.
 */

import { timeoutParam, RESULT_SCHEMA } from './schema.js'
import { GhMissingError } from './gh.js'

/** Domains whose repository selection uses gh's global --repo flag. */
const REPO_FLAG_DOMAINS = new Set(['github_pr', 'github_issue', 'github_release', 'github_actions'])

/** Loaded domain definitions (order = tool registration order). */
import auth from './domains/auth.js'
import repo from './domains/repo.js'
import pr from './domains/pr.js'
import issue from './domains/issue.js'
import commit from './domains/commit.js'
import release from './domains/release.js'
import actions from './domains/actions.js'
import codespace from './domains/codespace.js'
import search from './domains/search.js'
import api from './domains/api.js'
import cli from './domains/cli.js'
import git from './domains/git.js'

const DOMAINS = [auth, repo, pr, issue, commit, release, actions, codespace, search, api, cli, git]

/** Build the model-facing description: domain summary + action catalog. */
function describe(domain) {
  const lines = Object.entries(domain.actions).map(
    ([key, def]) => `- ${key}: ${def.help}`,
  )
  const tail = domain.gated
    ? '\nThis tool is only registered when the plugin config sets allowRaw: true.'
    : ''
  return `${domain.description}\n\nActions:\n${lines.join('\n')}${tail}`
}

/** Model-visible rendering of a run result. */
function renderResult(_args, value) {
  const parts = [`$ ${value.command}`]
  if (value.stdout) parts.push(value.stdout)
  if (value.stderr) parts.push(`[stderr]\n${value.stderr}`)
  const status = value.timedOut
    ? `✗ timed out after ${value.durationMs}ms`
    : value.ok
      ? `✓ exit ${value.exitCode} · ${(value.durationMs / 1000).toFixed(1)}s`
      : `✗ exit ${value.exitCode} · ${(value.durationMs / 1000).toFixed(1)}s`
  parts.push(status)
  if (value.truncated) parts.push(`[output truncated; tail continues in spill file: ${value.spillPath}]`)
  return [{ type: 'text', text: parts.join('\n') }]
}

/** Hide secret-looking parameter values from UI cards. */
function sanitizeArgs(args) {
  const clone = { ...args }
  if (typeof clone.token === 'string' && clone.token !== '') clone.token = '***'
  return clone
}

/**
 * Register every domain tool on ctx.tools.
 *
 * @param {object} ctx plugin context (ctx.tools)
 * @param {object} cfg resolved plugin config
 * @param {{ run: function, probe: function }} runner gh runner
 */
export function registerDomainTools(ctx, cfg, runner) {
  for (const domain of DOMAINS) {
    if (domain.gated && cfg.allowRaw !== true) continue

    const parameters = {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: Object.keys(domain.actions),
          description: `The ${domain.title.toLowerCase()} operation to perform.`,
        },
        ...domain.params,
        timeoutMs: timeoutParam(),
      },
      required: ['action'],
    }

    ctx.tools.register({
      name: domain.tool,
      description: describe(domain),
      parameters,
      output: { schema: RESULT_SCHEMA, render: renderResult },
      presentCall: (args) => ({
        card: 'generic',
        title: `GitHub · ${domain.tool.replace('github_', '')} ${String(args?.action ?? '')}`.trim(),
        kind: 'other',
        rawInput: sanitizeArgs(args ?? {}),
      }),
      async execute(args, exec) {
        const action = domain.actions[args.action]
        if (!action) return fail(`Unknown action ${JSON.stringify(args.action)}.`)

        // Gate 3: destructive actions.
        if (action.destructive === true) {
          if (cfg.allowDestructive !== true) {
            return fail(
              `Action "${args.action}" is destructive and the plugin config has allowDestructive: false. ` +
                'Enable it in cordis.patch.yml to permit this operation.',
            )
          }
          if (args.confirm !== true) {
            return fail(
              `Action "${args.action}" is destructive — call it again with confirm: true to proceed. ` +
                'Review the target (repo/tag/run/codespace) before confirming.',
            )
          }
        }

        // Gate 2: required parameters + custom validation.
        for (const key of action.needs ?? []) {
          const value = args[key]
          if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
            return fail(`Action "${args.action}" requires parameter \`${key}\` (missing or empty).`)
          }
        }
        const checkError = action.check?.(args)
        if (checkError) return fail(checkError)

        // Repository resolution.
        const repo = args.repo || cfg.defaultRepo || ''
        if (action.requiresRepo && !repo) {
          return fail(`Action "${args.action}" requires \`repo\` ("owner/name") or a plugin config defaultRepo.`)
        }

        // argv construction (definitions may return { error } to abort).
        const argv = action.argv(args, cfg, repo)
        if (!Array.isArray(argv)) return fail(argv.error ?? 'command construction failed')
        if (argv.length === 0) return fail('constructed an empty command')

        if (REPO_FLAG_DOMAINS.has(domain.tool) && repo) argv.push('--repo', repo)

        // Structured output injection.
        const wantsJson = typeof action.json === 'string' && action.noJson?.(args) !== true
        if (wantsJson) argv.push('--json', action.json)
        const jq = args.jq || action.defaultJq
        if (jq && (wantsJson || domain.tool === 'github_api' || domain.tool === 'github_commit')) {
          argv.push('--jq', jq)
        }

        // Gate 4: timeouts (watch/log actions get the long budget).
        const timeoutMs = args.timeoutMs ?? (action.watch ? cfg.watchTimeoutMs : cfg.timeoutMs)

        // github_git runs the local git binary; everything else runs gh.
        const result = domain.bin === 'git'
          ? await runner.runGit(argv, { exec, timeoutMs })
          : await runner.run(argv, { exec, timeoutMs })

        // gh executable missing → infrastructure failure (isError result).
        if (result.exitCode === -1 && /failed to (run|spawn)/.test(result.stderr)) {
          await runner.probe()
          throw new GhMissingError(result.stderr.replace(/^failed to (run|spawn) [^:]*: /, ''))
        }

        // Authentication guidance on the common 401/未登录 failures.
        if (!result.ok && /not logged into|authentication required|GH_TOKEN|bad credentials/i.test(result.stderr + result.stdout)) {
          result.stderr = (result.stderr ? result.stderr + '\n' : '') +
            '[hint] gh is not authenticated for this host. Call the github_auth tool with action "status" to inspect, ' +
            'then either action "setup" with a PAT, or export GH_TOKEN in the DSH host environment (~/.dsh/.env).'
        }
        return result
      },
    })

    ctx.logger.info('registered tool %s (%d actions)', domain.tool, Object.keys(domain.actions).length)
  }

  // Gated-domain notice so the omission is understandable in logs.
  if (cli.gated && cfg.allowRaw !== true) {
    ctx.logger.info('github_cli (raw passthrough) not registered — set allowRaw: true in config to enable')
  }
}

/** Uniform non-throwing failure result for parameter/gate violations. */
function fail(message) {
  return {
    ok: false,
    exitCode: -1,
    signal: '',
    timedOut: false,
    durationMs: 0,
    command: '(rejected before execution)',
    stdout: '',
    stderr: message,
    truncated: false,
    spillPath: '',
  }
}
