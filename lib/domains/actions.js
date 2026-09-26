/**
 * github_actions — GitHub Actions runs and workflows over `gh run` / `gh workflow`.
 */
import { str, enumStr, bool, int, strArr, repoParam, jqParam, confirmParam } from '../schema.js'

const RUN_LIST_JSON = 'databaseId,displayTitle,workflowName,status,conclusion,event,headBranch,createdAt,updatedAt,url'
const RUN_VIEW_JSON = 'databaseId,displayTitle,workflowName,status,conclusion,event,headBranch,headSha,createdAt,startedAt,updatedAt,url,jobs'

/** @type {import('../types.js').DomainDef} */
const domain = {
  tool: 'github_actions',
  title: 'Actions (runs & workflows)',
  description:
    'GitHub Actions operations: list/watch/view/rerun/cancel/delete ' +
    'workflow runs; list/view/dispatch workflows. Use run_list to find the ' +
    'run id, run_watch to follow a run to completion (long timeout), ' +
    'workflow_dispatch to trigger a workflow manually.',
  params: {
    repo: repoParam('Repository "owner/name" (defaults to config defaultRepo or the current directory\'s git remote).'),
    runId: int('Run database id (run_view/run_watch/run_rerun/run_cancel/run_delete) — the `databaseId` field from run_list.'),
    workflow: str('Workflow name, filename, or id (workflow_view/workflow_dispatch); run_list: filter by workflow.'),
    attempt: int('run_view: specific attempt number of the run.'),
    job: str('run_view: specific job id; run_rerun: rerun only this job.'),
    log: bool('run_view: show the full log of the run (or job).'),
    logFailed: bool('run_view: show only logs of failed steps.'),
    exitStatus: bool('run_watch: exit non-zero when the run fails.'),
    compact: bool('run_watch: show only relevant/failed steps.'),
    failed: bool('run_rerun: rerun only failed jobs.'),
    status: enumStr(
      ['queued', 'in_progress', 'completed', 'action_required', 'cancelled', 'failure', 'neutral', 'skipped', 'success', 'timed_out'],
      'run_list: filter by run status or conclusion.',
    ),
    event: str('run_list: filter by event type, e.g. "push", "pull_request".'),
    branch: str('run_list: filter by branch; run_view: filter by branch.'),
    actor: str('run_list: filter by the user who triggered the run (maps to gh --user).'),
    created: str('run_list: filter by creation date, e.g. ">=2024-01-01".'),
    limit: int('run_list/workflow_list: maximum results (default 30/50).'),
    all: bool('workflow_list: include disabled workflows.'),
    yaml: bool('workflow_view: show the workflow YAML file.'),
    ref: str('workflow_dispatch: branch or tag containing the workflow file version to run.'),
    inputs: strArr('workflow_dispatch: workflow inputs as key=value strings, e.g. ["logLevel=debug"].'),
    jq: jqParam(),
    confirm: confirmParam(),
  },
  actions: {
    run_list: {
      help: 'List workflow runs (filter by workflow/branch/status/event/actor).',
      needs: [],
      json: RUN_LIST_JSON,
      argv: (a) => {
        const argv = ['run', 'list']
        if (a.workflow) argv.push('--workflow', a.workflow)
        if (a.branch) argv.push('--branch', a.branch)
        if (a.actor) argv.push('--user', a.actor)
        if (a.status) argv.push('--status', a.status)
        if (a.event) argv.push('--event', a.event)
        if (a.created) argv.push('--created', a.created)
        if (a.limit) argv.push('--limit', String(a.limit))
        return argv
      },
    },
    run_view: {
      help: 'Show one run (jobs, steps) as JSON, or its log with log/logFailed. Requires `runId`.',
      needs: ['runId'],
      json: RUN_VIEW_JSON,
      check: (a) => (a.log && a.logFailed ? 'run_view: pass either `log` or `logFailed`, not both.' : null),
      argv: (a) => {
        const argv = ['run', 'view', String(a.runId)]
        if (a.attempt) argv.push('--attempt', String(a.attempt))
        if (a.job) argv.push('--job', a.job)
        if (a.log) argv.push('--log')
        else if (a.logFailed) argv.push('--log-failed')
        return argv
      },
      noJson: (a) => Boolean(a.log || a.logFailed),
    },
    run_watch: {
      help: 'Follow a run until completion (plain-text progress; long timeout; exitStatus to fail on failure).',
      needs: ['runId'],
      watch: true,
      json: false,
      argv: (a) => {
        const argv = ['run', 'watch', String(a.runId), '--interval', '5']
        if (a.exitStatus) argv.push('--exit-status')
        if (a.compact) argv.push('--compact')
        return argv
      },
    },
    run_rerun: {
      help: 'Re-run a run (all jobs, only failed jobs with failed=true, or one `job`).',
      needs: ['runId'],
      argv: (a) => {
        const argv = ['run', 'rerun', String(a.runId)]
        if (a.failed) argv.push('--failed')
        if (a.job) argv.push('--job', a.job)
        return argv
      },
    },
    run_cancel: {
      help: 'DESTRUCTIVE: cancel a running workflow run.',
      needs: ['runId'],
      destructive: true,
      argv: (a) => ['run', 'cancel', String(a.runId)],
    },
    run_delete: {
      help: 'DESTRUCTIVE: delete a workflow run record.',
      needs: ['runId'],
      destructive: true,
      argv: (a) => ['run', 'delete', String(a.runId)],
    },
    workflow_list: {
      help: 'List workflows of the repository.',
      needs: [],
      argv: (a) => {
        const argv = ['workflow', 'list']
        if (a.all) argv.push('--all')
        if (a.limit) argv.push('--limit', String(a.limit))
        return argv
      },
    },
    workflow_view: {
      help: 'Show one workflow (requires `workflow` as name/filename/id; yaml=true shows the file).',
      needs: ['workflow'],
      argv: (a) => {
        const argv = ['workflow', 'view', a.workflow]
        if (a.yaml) argv.push('--yaml')
        return argv
      },
    },
    workflow_dispatch: {
      help: 'DESTRUCTIVE-ish: manually trigger a workflow (requires `workflow`; inputs as key=value strings).',
      needs: ['workflow'],
      destructive: true,
      argv: (a) => {
        const argv = ['workflow', 'run', a.workflow]
        if (a.ref) argv.push('--ref', a.ref)
        for (const input of a.inputs ?? []) {
          const eq = input.indexOf('=')
          if (eq <= 0) return { error: `workflow_dispatch: inputs must be key=value strings, got ${JSON.stringify(input)}` }
          argv.push('--raw-field', input)
        }
        return argv
      },
    },
  },
}

export default domain
