/**
 * JSON Schema helpers constrained to the enforced dsh-tools subset.
 *
 * The tool registry only accepts: type / oneOf / properties / required /
 * additionalProperties / items / enum / const, plus the annotation keywords
 * description / title / default / examples. Anything else (pattern, minimum,
 * anyOf, format, ...) rejects the whole definition with UNSUPPORTED_SCHEMA.
 * Every schema this plugin produces goes through these helpers so a stray
 * keyword can never slip in.
 */

/** A string property. */
export const str = (description) => ({ type: 'string', description })

/** A string property restricted to a closed set of values. */
export const enumStr = (values, description) => ({
  type: 'string',
  enum: [...values],
  description,
})

/** A boolean property. */
export const bool = (description) => ({ type: 'boolean', description })

/** An integer property. */
export const int = (description) => ({ type: 'integer', description })

/** An array-of-strings property. */
export const strArr = (description) => ({
  type: 'array',
  items: { type: 'string' },
  description,
})

/** Shared `repo` parameter ("owner/name" target selector). */
export const repoParam = (description) => str(description)

/** Shared `jq` parameter for commands that run with --json. */
export const jqParam = () =>
  str(
    'Optional jq filter applied to the JSON output of this command ' +
      '(gh runs it via --jq), e.g. ".[] | .number". Only commands that emit ' +
      '--json output honor this.',
  )

/** The explicit confirmation flag every destructive action requires. */
export const confirmParam = () =>
  bool(
    'DESTRUCTIVE: set to true to explicitly confirm this action. ' +
      'The call is rejected when this flag is absent or false.',
  )

/** Shared per-call timeout override (milliseconds). */
export const timeoutParam = () =>
  int(
    'Optional per-call timeout in milliseconds. Capped by the plugin ' +
      'configuration; when omitted, normal commands use timeoutMs and ' +
      'watch/log actions use watchTimeoutMs.',
  )

/**
 * The unified result schema every github_* tool returns. `data` is the
 * parsed --json payload and is intentionally unconstrained (annotation-only
 * schema, the subset's way to say "any JSON value").
 */
export const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: bool('True when the gh process exited with code 0.'),
    exitCode: int('Process exit code (-1 when the process was killed or failed to spawn).'),
    signal: str('Termination signal when the process was killed, otherwise an empty string.'),
    timedOut: bool('True when the plugin killed the process after its timeout.'),
    durationMs: int('Wall-clock duration of the process run.'),
    command: str('The gh command line that ran (secrets are never part of argv).'),
    stdout: str('Captured standard output, possibly truncated (see truncated/spillPath).'),
    stderr: str('Captured standard error, possibly truncated.'),
    truncated: bool('True when output exceeded maxOutputBytes and was cut in memory.'),
    spillPath: str('Path holding the complete untruncated output when truncated, otherwise an empty string.'),
    data: {
      description:
        'Parsed JSON payload when the command ran with --json and produced valid JSON; absent otherwise.',
    },
  },
  required: [
    'ok',
    'exitCode',
    'signal',
    'timedOut',
    'durationMs',
    'command',
    'stdout',
    'stderr',
    'truncated',
    'spillPath',
  ],
}
