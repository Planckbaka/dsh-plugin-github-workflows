/**
 * gh/git runner: the single place this plugin talks to the GitHub CLI and
 * local git.
 *
 * Design points:
 * - argv arrays are spawned WITHOUT a shell (shell: false), so every
 *   model-supplied string (titles, bodies, queries...) is passed as one
 *   argument and can never be re-interpreted by a shell.
 * - Secrets never appear in argv: token-based login pipes the token through
 *   stdin; the git-credential fallback keeps the token in child-process env.
 * - Auth fallback: when gh itself is NOT authenticated and the host env has
 *   no GH_TOKEN/GITHUB_TOKEN, the GitHub credential from git's credential
 *   helper (e.g. Git Credential Manager) is read once (prompts disabled)
 *   and injected as GH_TOKEN for gh invocations — machines that can `git
 *   push` can use this plugin without a separate gh login.
 * - Both a wall-clock timeout and the caller's AbortSignal (exec.signal)
 *   kill the child; a non-zero exit is REPORTED (ok: false), not thrown —
 *   the model decides what to do. Only infrastructure failures resolve
 *   with an error result naming the cause.
 * - Output beyond maxOutputBytes is truncated in memory; every byte from
 *   the first overflow chunk onward is preserved in a spill file whose path
 *   is returned (in-memory prefix + spill tail = complete output).
 * - Prompts are hard-disabled via GH_PROMPT_DISABLED / GIT_TERMINAL_PROMPT
 *   so no interactive prompt can ever hang the host process.
 */

import { spawn } from 'node:child_process'
import { appendFileSync, closeSync, openSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Thrown when the gh executable itself is unavailable. */
export class GhMissingError extends Error {
  constructor(detail) {
    super(
      `GitHub CLI (gh) is not available: ${detail}\n` +
        'Install it from https://cli.github.com/ (winget install GitHub.cli ' +
        'on Windows), or set the plugin config "ghPath" to the gh executable.',
    )
    this.name = 'GhMissingError'
  }
}

/**
 * Create the configured runner.
 *
 * @param {import('./types.js').PluginConfig} cfg resolved plugin config
 * @param {{ info?: function, warn?: function }} [logger] plugin logger for the fallback notice
 * @returns {import('./types.js').Runner}
 */
export function createRunner(cfg, logger) {
  const bin = cfg.ghPath && String(cfg.ghPath).trim() !== '' ? cfg.ghPath : 'gh'
  const gitBin = cfg.gitPath && String(cfg.gitPath).trim() !== '' ? cfg.gitPath : 'git'
  /** @type {Record<string, string | undefined>} */
  const baseEnv = {
    ...globalThis.process?.env,
    ...(cfg.env ?? {}),
    GH_PROMPT_DISABLED: '1',
    GH_NO_UPDATE_NOTIFIER: '1',
    NO_COLOR: '1',
  }
  const QUIET_ENV = {
    ...baseEnv,
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
  }

  let probePromise = null
  let authPromise = null
  let gitToken = undefined // undefined = unresolved, '' = none, string = token

  /** Run `gh --version` once and cache availability + version string. */
  function probe() {
    if (probePromise === null) {
      probePromise = spawnRun(bin, ['--version'], { timeoutMs: 10_000, env: baseEnv })
        .then((r) => ({
          available: r.ok,
          version: String(r.stdout ?? '').split(/\r?\n/, 1)[0].trim(),
        }))
        .catch((error) => ({ available: false, version: '', error: String(error?.message ?? error) }))
    }
    return probePromise
  }

  /**
   * Resolve the auth fallback once: if gh is unauthenticated and the host
   * env carries no token, read the GitHub credential from git's credential
   * helper (never prompts, never logged).
   */
  function resolveAuth() {
    if (authPromise === null) {
      authPromise = (async () => {
        if (baseEnv.GH_TOKEN || baseEnv.GITHUB_TOKEN) return ''
        let ghAuthed = false
        try {
          const status = await spawnRun(bin, ['auth', 'status'], {
            timeoutMs: 15_000, env: baseEnv, internal: true,
          })
          ghAuthed = status.ok
        } catch { /* probe failure → treat as unauthenticated */ }
        if (ghAuthed) return ''
        try {
          const cred = await spawnRun(gitBin, ['credential', 'fill'], {
            timeoutMs: 15_000,
            env: QUIET_ENV,
            stdin: 'protocol=https\nhost=github.com\n\n',
            internal: true,
          })
          const line = String(cred.stdout ?? '')
            .split(/\r?\n/)
            .find((l) => l.startsWith('password='))
          const token = line ? line.slice('password='.length).trim() : ''
          if (token) {
            logger?.info?.(
              'gh is not logged in — using the GitHub credential from git\'s ' +
                'credential helper as a GH_TOKEN fallback',
            )
            return token
          }
        } catch { /* no git credential available */ }
        return ''
      })()
    }
    return authPromise
  }

  /** @returns {Promise<{ ghAuthenticated: boolean, gitCredentialFallback: boolean }>} */
  async function authInfo() {
    const token = await resolveAuth()
    return { ghAuthenticated: token === '', gitCredentialFallback: token !== '' }
  }

  /**
   * Human-readable command line for logs and the model-visible render.
   * Secrets never travel in argv with this plugin, so this is safe to show.
   */
  function displayCommand(executable, argv) {
    return [executable, ...argv]
      .map((part) => (/[\s"'`<>|&;^]/.test(part) ? JSON.stringify(part) : part))
      .join(' ')
  }

  /**
   * Run `gh <argv...>` (auth fallback applied unless `internal`).
   *
   * @param {string[]} argv arguments after the executable
   * @param {{ exec?: any, timeoutMs?: number, cwd?: string, stdin?: string, internal?: boolean }} options
   * @returns {Promise<object>} the RESULT_SCHEMA-shaped result object
   */
  async function run(argv, options = {}) {
    let env = baseEnv
    if (!options.internal && !baseEnv.GH_TOKEN && !baseEnv.GITHUB_TOKEN) {
      const token = await resolveAuth()
      if (token) env = { ...baseEnv, GH_TOKEN: token }
    }
    return spawnRun(bin, argv, { ...options, env })
  }

  /**
   * Run `git <argv...>` in the current working directory.
   *
   * @param {string[]} argv arguments after the executable
   * @param {{ exec?: any, timeoutMs?: number, cwd?: string, stdin?: string }} options
   */
  function runGit(argv, options = {}) {
    return spawnRun(gitBin, argv, { ...options, env: QUIET_ENV })
  }

  /**
   * Shared spawn implementation for both executables.
   *
   * @param {string} executable gh or git path
   * @param {string[]} argv arguments after the executable
   * @param {import('./types.js').RunOptions} options
   * @returns {Promise<import('./types.js').RunResult>}
   */
  async function spawnRun(executable, argv, options = {}) {
    const started = Date.now()
    const cap = Math.max(1024, cfg.maxOutputBytes | 0)
    const timeoutMs = Math.max(1000, Math.min(options.timeoutMs ?? cfg.timeoutMs, 600_000))

    let stdoutText = ''
    let stderrText = ''
    let truncated = false
    let spillFd = null
    let spillPath = ''
    let stderrMarked = false

    const ensureSpill = () => {
      spillPath = join(tmpdir(), `dsh-gh-${randomUUID()}.log`)
      spillFd = openSync(spillPath, 'wx')
    }

    const closeSpill = (keep) => {
      if (spillFd === null) return
      try { closeSync(spillFd) } catch { /* best effort */ }
      spillFd = null
      if (!keep) {
        try { unlinkSync(spillPath) } catch { /* best effort */ }
        spillPath = ''
      }
    }

    /** Chunk sink: in-memory up to the cap, spill file for everything after. */
    const sink = (channel) => (chunk) => {
      if (chunk.length === 0) return
      const current = channel === 'stdout' ? stdoutText.length : stderrText.length
      if (spillFd === null && current + chunk.length > cap) ensureSpill()
      if (spillFd !== null) {
        if (channel === 'stderr' && !stderrMarked) {
          try { appendFileSync(spillFd, '\n[stderr]\n') } catch { /* best effort */ }
          stderrMarked = true
        }
        try { appendFileSync(spillFd, chunk) } catch { /* best effort */ }
      }
      if (current < cap) {
        const take = chunk.subarray(0, cap - current).toString('utf8')
        if (channel === 'stdout') stdoutText += take
        else stderrText += take
        if (current + chunk.length > cap) truncated = true
      }
    }

    return await new Promise((resolve) => {
      let child
      try {
        child = spawn(executable, argv, {
          shell: false,
          windowsHide: true,
          cwd: options.cwd,
          env: options.env ?? baseEnv,
        })
      } catch (error) {
        resolve({
          ok: false,
          exitCode: -1,
          signal: '',
          timedOut: false,
          durationMs: Date.now() - started,
          command: displayCommand(executable, argv),
          stdout: '',
          stderr: `failed to spawn ${executable}: ${String(error?.message ?? error)}`,
          truncated: false,
          spillPath: '',
        })
        return
      }

      let settled = false
      let timedOut = false
      let killReason = ''

      const onKill = (reason) => {
        if (settled) return
        if (reason === 'timeout') timedOut = true
        killReason = reason
        try { child.kill() } catch { /* already gone */ }
      }

      const signal = options.exec?.signal
      if (signal?.aborted) onKill('aborted')
      else if (signal && typeof signal.addEventListener === 'function') {
        signal.addEventListener('abort', () => onKill('aborted'), { once: true })
      }
      const timer = setTimeout(() => onKill('timeout'), timeoutMs)

      child.stdout?.on('data', sink('stdout'))
      child.stderr?.on('data', sink('stderr'))
      child.on('error', (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        closeSpill(false)
        resolve({
          ok: false,
          exitCode: -1,
          signal: '',
          timedOut: false,
          durationMs: Date.now() - started,
          command: displayCommand(executable, argv),
          stdout: stdoutText,
          stderr: `failed to run ${executable}: ${String(error?.message ?? error)}`,
          truncated: false,
          spillPath: '',
        })
      })

      if (options.stdin !== undefined && child.stdin) {
        child.stdin.on('error', () => { /* EPIPE when the child rejects early */ })
        child.stdin.write(options.stdin)
        child.stdin.end()
      }

      child.on('close', (code, closeSignal) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        const durationMs = Date.now() - started

        if (timedOut) {
          const note = `[dsh-plugin-github] timed out after ${timeoutMs}ms — process killed. ` +
            'Raise the per-call timeoutMs (capped at 600000) or the plugin watchTimeoutMs for long-running commands.'
          stderrText = (stderrText ? stderrText + '\n' : '') + note
        }
        closeSpill(truncated)

        let data
        {
          // gh prints JSON for --json commands and for `gh api` responses;
          // parse whenever the output is JSON-shaped so both reach `data`.
          const text = stdoutText.trim()
          if (text.startsWith('{') || text.startsWith('[')) {
            try { data = JSON.parse(text) } catch { /* not JSON; leave data unset */ }
          }
        }

        const result = {
          ok: code === 0 && !timedOut,
          exitCode: code ?? -1,
          signal: closeSignal ?? (killReason ? `killed(${killReason})` : ''),
          timedOut,
          durationMs,
          command: displayCommand(executable, argv),
          stdout: stdoutText,
          stderr: stderrText,
          truncated,
          spillPath,
        }
        if (data !== undefined) result.data = data
        resolve(result)
      })
    })
  }

  return { run, runGit, probe, authInfo }
}
