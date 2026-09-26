/**
 * dsh-plugin-github — GitHub workflows for the DeepSeek Harness on gh CLI.
 *
 * Zero-dependency Host plugin: one entry (id: github) registers the
 * github_* tool family. All configuration is optional with code-level
 * defaults (no schema dependency), so a local link install works as-is.
 */

import { createRunner } from './gh.js'
import { registerDomainTools } from './registry.js'

const name = 'github'
const inject = ['tools']

/** Defaults for every config key (cordis.patch.yml config section). */
const DEFAULT_CONFIG = {
  ghPath: '',
  gitPath: '',
  defaultRepo: '',
  timeoutMs: 60_000,
  watchTimeoutMs: 300_000,
  maxOutputBytes: 65_536,
  allowRaw: false,
  allowDestructive: true,
  env: {},
}

/**
 * @param {object} ctx plugin context (ctx.tools, ctx.logger, ctx.effect)
 * @param {object} [config] entry config from the patch layer
 * @param {import('./types.js').Runner} [runnerOverride] test injection; when
 *   omitted the real gh/git runner is created and its probes are fired
 */
function apply(ctx, config, runnerOverride) {
  const cfg = {
    ...DEFAULT_CONFIG,
    ...(config ?? {}),
    env: { ...DEFAULT_CONFIG.env, ...(config?.env ?? {}) },
  }
  cfg.timeoutMs = clampTimeout(cfg.timeoutMs, DEFAULT_CONFIG.timeoutMs)
  cfg.watchTimeoutMs = clampTimeout(cfg.watchTimeoutMs, DEFAULT_CONFIG.watchTimeoutMs)
  cfg.maxOutputBytes = Number.isFinite(cfg.maxOutputBytes) && cfg.maxOutputBytes > 0
    ? Math.floor(cfg.maxOutputBytes)
    : DEFAULT_CONFIG.maxOutputBytes

  const runner = runnerOverride ?? createRunner(cfg, ctx.logger)
  registerDomainTools(ctx, cfg, runner)

  ctx.logger.info(
    'dsh-plugin-github loaded: %d tools, timeout %dms (watch %dms), defaultRepo %s, allowRaw %s',
    11 + (cfg.allowRaw ? 1 : 0),
    cfg.timeoutMs,
    cfg.watchTimeoutMs,
    cfg.defaultRepo || '(git context)',
    cfg.allowRaw,
  )

  // Fire the availability + auth probes so the first tool call already
  // benefits from cached results; log outcomes for early diagnosis.
  // (Skipped for injected test runners, which never spawn.)
  if (!runnerOverride) {
    runner.probe().then((p) => {
      if (p.available) ctx.logger.info('gh detected: %s', p.version)
      else ctx.logger.warn('gh not usable (%s) — github_* tools will return guidance until it is installed', p.version || 'probe failed')
    })
    runner.authInfo().then((a) => {
      if (a.ghAuthenticated) ctx.logger.info('auth: gh authenticated')
      else if (a.gitCredentialFallback) ctx.logger.info('auth: gh unauthenticated — using git credential manager fallback (GH_TOKEN)')
      else ctx.logger.warn('auth: no GitHub credential found (gh not logged in, no GH_TOKEN, no git credential) — call the github_auth tool to set one up')
    })
  }

  ctx.effect(() => () => {
    ctx.logger.info('dsh-plugin-github disposed')
  })
}

function clampTimeout(value, fallback) {
  return Number.isFinite(value) && value >= 1000 ? Math.min(Math.floor(value), 600_000) : fallback
}

export { apply, inject, name }
