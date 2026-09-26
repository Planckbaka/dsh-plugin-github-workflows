/**
 * Type surface for dsh-plugin-github-workflows.
 *
 * The plugin ships zero-dependency plain ESM (directly installable from a
 * git repository); TypeScript-level safety comes from these JSDoc types +
 * `tsc --noEmit` (see tsconfig.json, CI "Type check" step) instead of a
 * build step. See CONTRIBUTING.md "Type checking" for the rationale.
 */

/** JSON-Schema subset accepted by the dsh-tools registry (lib/schema.js). */
export interface PropSchema {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'
  description?: string
  title?: string
  enum?: string[]
  items?: PropSchema
  properties?: Record<string, PropSchema>
  required?: string[]
  additionalProperties?: boolean
  oneOf?: PropSchema[]
  const?: unknown
  default?: unknown
  examples?: unknown[]
}

/** Resolved plugin config (DEFAULT_CONFIG in lib/index.js merged with the patch config). */
export interface PluginConfig {
  ghPath: string
  gitPath: string
  defaultRepo: string
  timeoutMs: number
  watchTimeoutMs: number
  maxOutputBytes: number
  allowRaw: boolean
  allowDestructive: boolean
  env: Record<string, string>
}

/** One action of a domain: maps typed parameters to a gh/git argv array. */
export interface ActionDef {
  /** One-line help shown in the tool description's action catalog. */
  help: string
  /** Parameters required by this action (checked before argv runs). */
  needs?: string[]
  /** Action-wide destructive gate: requires confirm:true AND config allowDestructive. */
  destructive?: boolean
  /** Watch/log style action: uses the watchTimeoutMs budget. */
  watch?: boolean
  /** Comma-separated --json field list; false = this action never emits --json. */
  json?: string | false
  /** Per-args opt-out of --json (e.g. run_view with log: true). */
  noJson?: (args: any) => boolean
  /** The repo (args.repo or config defaultRepo) must resolve before running. */
  requiresRepo?: boolean
  /** jq filter applied when the caller passes none. */
  defaultJq?: string
  /** Extra validation; returns an error message or null. */
  check?: (args: any, cfg?: PluginConfig) => string | null
  /** Builds the gh/git arguments; abort with { error } for gate failures. */
  argv: (args: any, cfg?: PluginConfig, repo?: string) => string[] | { error: string }
  /** Optional stdin payload — the secrets path; tokens never go in argv. */
  stdin?: (args: any) => string
  /** Footer note shown next to the action catalog. */
  note?: string
}

/** A domain tool definition consumed by lib/registry.js. */
export interface DomainDef {
  /** Tool name, must start with github_. */
  tool: string
  /** Human label used in the description header. */
  title: string
  /** 'git' routes argv through runner.runGit; default (gh) runs gh. */
  bin?: 'git'
  /** Gated domains register only when config allowRaw is true. */
  gated?: boolean
  /** Model-facing description; the registry appends the action catalog. */
  description: string
  /** Parameter schemas (the registry adds `action` and `timeoutMs`). */
  params: Record<string, PropSchema>
  actions: Record<string, ActionDef>
}

/** Unified gh/git run result (RESULT_SCHEMA in lib/schema.js). */
export interface RunResult {
  ok: boolean
  exitCode: number
  signal: string
  timedOut: boolean
  durationMs: number
  command: string
  stdout: string
  stderr: string
  truncated: boolean
  spillPath: string
  /** Parsed JSON payload when the output was JSON-shaped. */
  data?: unknown
}

/** Options for runner.run / runner.runGit. */
export interface RunOptions {
  exec?: any
  timeoutMs?: number
  cwd?: string
  stdin?: string
  /** Internal calls (auth probe) skip the credential fallback. */
  internal?: boolean
  env?: Record<string, string>
}

/** The runner API created by createRunner in lib/gh.js. */
export interface Runner {
  run(argv: string[], options?: RunOptions): Promise<RunResult>
  runGit(argv: string[], options?: RunOptions): Promise<RunResult>
  probe(): Promise<{ available: boolean; version: string; error?: string }>
  authInfo(): Promise<{ ghAuthenticated: boolean; gitCredentialFallback: boolean }>
}
