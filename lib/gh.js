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
 * - Each output channel keeps at most maxOutputBytes in memory, ending on
 *   a complete UTF-8 code point. The shared spill file holds both channels'
 *   overflow in arrival order, stderr's preceded by a [stderr] marker.
 * - Prompts are hard-disabled via GH_PROMPT_DISABLED / GIT_TERMINAL_PROMPT
 *   so no interactive prompt can ever hang the host process.
 */

import { spawn } from 'node:child_process'
import { appendFileSync, closeSync, openSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'

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
  /** @type {Promise<{ ghAuthed: boolean, envToken: boolean, fallback: string }> | null} */
  let authPromise = null

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
   * Resolve the auth state once: gh's own login state, whether the host env
   * carries a token, and — when gh is unauthenticated — the GitHub
   * credential from git's credential helper (never prompts, never logged).
   * @returns {Promise<{ ghAuthed: boolean, envToken: boolean, fallback: string }>}
   */
  function resolveAuth() {
    if (authPromise === null) {
      authPromise = (async () => {
        if (baseEnv.GH_TOKEN || baseEnv.GITHUB_TOKEN) {
          return { ghAuthed: true, envToken: true, fallback: '' }
        }
        let ghAuthed = false
        try {
          const status = await spawnRun(bin, ['auth', 'status'], {
            timeoutMs: 15_000, env: baseEnv, internal: true,
          })
          ghAuthed = status.ok
        } catch { /* probe failure → treat as unauthenticated */ }
        if (ghAuthed) return { ghAuthed: true, envToken: false, fallback: '' }
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
            return { ghAuthed: false, envToken: false, fallback: token }
          }
        } catch { /* no git credential available */ }
        return { ghAuthed: false, envToken: false, fallback: '' }
      })()
    }
    return authPromise
  }

  /** @returns {Promise<{ ghAuthenticated: boolean, gitCredentialFallback: boolean }>} */
  async function authInfo() {
    const state = await resolveAuth()
    return {
      ghAuthenticated: state.ghAuthed,
      gitCredentialFallback: state.fallback !== '',
    }
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
      const { fallback } = await resolveAuth()
      if (fallback) env = { ...baseEnv, GH_TOKEN: fallback }
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
    /** @type {Record<'stdout' | 'stderr', { bytes: number, decoder: StringDecoder, pending: Buffer, capped: boolean }>} */
    const channels = {
      stdout: { bytes: 0, decoder: new StringDecoder('utf8'), pending: Buffer.alloc(0), capped: false },
      stderr: { bytes: 0, decoder: new StringDecoder('utf8'), pending: Buffer.alloc(0), capped: false },
    }

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

    /**
     * Keep a byte-capped UTF-8 prefix per channel; spill only its remaining bytes.
     * Hold incomplete code points outside the decoder so they can move to the
     * spill tail if the cap lands inside one, even across chunk boundaries.
     * @param {'stdout' | 'stderr'} channel
     * @returns {(chunk: Buffer) => void}
     */
    const sink = (channel) => (chunk) => {
      if (chunk.length === 0) return
      const state = channels[channel]
      const input = state.pending.length ? Buffer.concat([state.pending, chunk]) : chunk
      const remaining = cap - state.bytes
      const overflow = input.length > remaining
      let end = state.capped ? 0 : Math.min(input.length, remaining)
      if (end > 0) {
        let start = end - 1
        while (start >= 0 && (input[start] & 0xc0) === 0x80) start--
        if (start >= 0) {
          const lead = input[start]
          const width = lead >= 0xf0 && lead <= 0xf4 ? 4
            : lead >= 0xe0 && lead <= 0xef ? 3
            : lead >= 0xc2 && lead <= 0xdf ? 2 : 1
          if (end - start < width) end = start
        }
        const text = state.decoder.write(input.subarray(0, end))
        if (channel === 'stdout') stdoutText += text
        else stderrText += text
        state.bytes += end
      }
      state.pending = Buffer.alloc(0)
      if (!state.capped && !overflow) {
        state.pending = Buffer.from(input.subarray(end))
        return
      }
      state.capped = true
      const tail = input.subarray(end)
      if (tail.length === 0) return
      truncated = true
      if (spillFd === null) ensureSpill()
      if (channel === 'stderr' && !stderrMarked) {
        try { appendFileSync(spillFd, '\n[stderr]\n') } catch { /* best effort */ }
        stderrMarked = true
      }
      try { appendFileSync(spillFd, tail) } catch { /* best effort */ }
    }

    // Never flush a capped decoder: an incomplete code point belongs in spill,
    // not in memory as a replacement character. Uncapped EOF retains normal decoding.
    const finishOutput = () => {
      if (!channels.stdout.capped) stdoutText += channels.stdout.decoder.end(channels.stdout.pending)
      if (!channels.stderr.capped) stderrText += channels.stderr.decoder.end(channels.stderr.pending)
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
        finishOutput()
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
        finishOutput()

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
