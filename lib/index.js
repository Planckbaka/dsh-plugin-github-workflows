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
  defaultRepo: '',
  timeoutMs: 60_000,
  watchTimeoutMs: 300_000,
  maxOutputBytes: 65_536,
  allowRaw: false,
  allowDestructive: true,
  env: {},
}

function apply(ctx, config) {
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

  const runner = createRunner(cfg)
  registerDomainTools(ctx, cfg, runner)

  ctx.logger.info(
    'dsh-plugin-github loaded: %d tools, timeout %dms (watch %dms), defaultRepo %s, allowRaw %s',
    10 + (cfg.allowRaw ? 1 : 0),
    cfg.timeoutMs,
    cfg.watchTimeoutMs,
    cfg.defaultRepo || '(git context)',
    cfg.allowRaw,
  )

  // Fire the availability probe so the first tool call already benefits
  // from a cached result; log the outcome for early diagnosis.
  runner.probe().then((p) => {
    if (p.available) ctx.logger.info('gh detected: %s', p.version)
    else ctx.logger.warn('gh not usable (%s) — github_* tools will return guidance until it is installed', p.version || 'probe failed')
  })

  ctx.effect(() => () => {
    ctx.logger.info('dsh-plugin-github disposed')
  })
}

function clampTimeout(value, fallback) {
  return Number.isFinite(value) && value >= 1000 ? Math.min(Math.floor(value), 600_000) : fallback
}

export { apply, inject, name }
