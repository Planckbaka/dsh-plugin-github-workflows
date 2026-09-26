/**
 * gh CLI runner: the single place this plugin talks to the GitHub CLI.
 *
 * Design points:
 * - argv arrays are spawned WITHOUT a shell (shell: false), so every
 *   model-supplied string (titles, bodies, queries...) is passed as one
 *   argument and can never be re-interpreted by a shell.
 * - Secrets never appear in argv: token-based login pipes the token through
 *   stdin instead.
 * - Both a wall-clock timeout and the caller's AbortSignal (exec.signal)
 *   kill the child process; a non-zero exit is REPORTED (ok: false), not
 *   thrown — the model decides what to do, exactly like the official shell
 *   tools. Only infrastructure failures (gh missing, spawn errors) resolve
 *   with an error result that names the cause.
 * - Output beyond maxOutputBytes is truncated in memory; every byte from the
 *   first overflow chunk onward is preserved in a spill file whose path is
 *   returned (in-memory prefix + spill tail = complete output).
 * - Prompts are hard-disabled via GH_PROMPT_DISABLED so no interactive
 *   prompt can ever hang the host process.
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
 * @param {object} cfg resolved plugin config (ghPath, timeoutMs, env, ...)
 * @returns {{ run: function, probe: function }} the runner API
 */
export function createRunner(cfg) {
  const bin = cfg.ghPath && String(cfg.ghPath).trim() !== '' ? cfg.ghPath : 'gh'
  const baseEnv = {
    ...globalThis.process?.env,
    ...(cfg.env ?? {}),
    GH_PROMPT_DISABLED: '1',
    GH_NO_UPDATE_NOTIFIER: '1',
    NO_COLOR: '1',
  }

  let probePromise = null

  /** Run `gh --version` once and cache availability + version string. */
  function probe() {
    if (probePromise === null) {
      probePromise = run(['--version'], { timeoutMs: 10_000 })
        .then((r) => ({
          available: r.ok,
          version: String(r.stdout ?? '').split(/\r?\n/, 1)[0].trim(),
        }))
        .catch((error) => ({ available: false, version: '', error: String(error?.message ?? error) }))
    }
    return probePromise
  }

  /**
   * Human-readable command line for logs and the model-visible render.
   * Secrets never travel in argv with this plugin, so this is safe to show.
   */
  function displayCommand(argv) {
    return ['gh', ...argv]
      .map((part) => (/[\s"'`<>|&;^]/.test(part) ? JSON.stringify(part) : part))
      .join(' ')
  }

  /**
   * Run `gh <argv...>`.
   *
   * @param {string[]} argv arguments after the executable
   * @param {{ exec?: any, timeoutMs?: number, cwd?: string, stdin?: string }} options
   * @returns {Promise<object>} the RESULT_SCHEMA-shaped result object
   */
  async function run(argv, options = {}) {
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
        child = spawn(bin, argv, {
          shell: false,
          windowsHide: true,
          cwd: options.cwd,
          env: baseEnv,
        })
      } catch (error) {
        resolve({
          ok: false,
          exitCode: -1,
          signal: '',
          timedOut: false,
          durationMs: Date.now() - started,
          command: displayCommand(argv),
          stdout: '',
          stderr: `failed to spawn ${bin}: ${String(error?.message ?? error)}`,
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
          command: displayCommand(argv),
          stdout: stdoutText,
          stderr: `failed to run ${bin}: ${String(error?.message ?? error)}`,
          truncated: false,
          spillPath: '',
        })
      })

      if (options.stdin !== undefined && child.stdin) {
        child.stdin.on('error', () => { /* EPIPE when gh rejects early */ })
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
          command: displayCommand(argv),
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

  return { run, probe }
}
