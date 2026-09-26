/**
 * github_codespace — Codespaces management over `gh codespace`.
 *
 * Selection: most subcommands take `--codespace NAME` (get names from list).
 * Non-interactive command execution goes through `ssh -- COMMAND`, the only
 * form that works with prompts disabled.
 */
import { str, bool, int, strArr, repoParam, jqParam, confirmParam } from '../schema.js'

const LIST_JSON = 'name,displayName,repository,branch,state,createdAt,lastUsedAt,machineName,owner'

export default {
  tool: 'github_codespace',
  title: 'Codespaces',
  description:
    'Manage GitHub Codespaces: list, create, execute a non-interactive ' +
    'command via SSH, copy files in/out, open in VS Code (web), stop, ' +
    'rebuild, stream logs, delete. Interactive SSH sessions are not possible ' +
    'through this tool — use the ssh action with a `command` to run remote ' +
    'commands (paths inside the codespace can be prefixed with "remote:").',
  params: {
    codespace: str('Codespace name (from the list action) — required by every action except list/create.'),
    repo: repoParam('create: repository "owner/name" to create the codespace for (defaults to config defaultRepo).'),
    branch: str('create: repository branch to base the codespace on.'),
    machine: str('create: hardware specification, e.g. "basicLinux32gb".'),
    location: str('create: location {EastUs|SouthEastAsia|WestEurope|WestUs2}.'),
    displayName: str('create: display name for the codespace (48 chars max).'),
    idleTimeout: str('create: inactivity before auto-stop, e.g. "10m", "1h".'),
    command: str('ssh: the command to execute inside the codespace (non-interactive).'),
    src: str('cp: source path — prefix with "remote:" for the codespace side, e.g. "remote:/work/app/logs".'),
    dst: str('cp: destination path — prefix with "remote:" for the codespace side.'),
    recursive: bool('cp: copy directories recursively.'),
    web: bool('code: open the web version of VS Code instead of desktop.'),
    full: bool('rebuild: perform a full rebuild (wipes the container and rebuilds the dev container).'),
    follow: bool('logs: keep tailing new log output until timeout.'),
    limit: int('list: maximum codespaces to list (default 30).'),
    jq: jqParam(),
    confirm: confirmParam(),
  },
  actions: {
    list: {
      help: 'List your codespaces (name, repo, branch, state) as JSON.',
      needs: [],
      json: LIST_JSON,
      argv: (a) => {
        const argv = ['codespace', 'list']
        if (a.limit) argv.push('--limit', String(a.limit))
        return argv
      },
    },
    create: {
      help: 'Create a codespace (requires `repo`; machine/location/branch optional).',
      needs: ['repo'],
      argv: (a) => {
        const argv = ['codespace', 'create', '--repo', a.repo]
        if (a.branch) argv.push('--branch', a.branch)
        if (a.machine) argv.push('--machine', a.machine)
        if (a.location) argv.push('--location', a.location)
        if (a.displayName) argv.push('--display-name', a.displayName)
        if (a.idleTimeout) argv.push('--idle-timeout', a.idleTimeout)
        return argv
      },
    },
    ssh: {
      help: 'Run a non-interactive command inside a codespace (requires `codespace` and `command`).',
      needs: ['codespace', 'command'],
      argv: (a) => ['codespace', 'ssh', '--codespace', a.codespace, '--', a.command],
    },
    cp: {
      help: 'Copy files between machine and codespace (requires `src` and `dst`; "remote:" prefix selects the codespace side).',
      needs: ['codespace', 'src', 'dst'],
      argv: (a) => {
        const argv = ['codespace', 'cp', '--codespace', a.codespace, a.src, a.dst]
        if (a.recursive) argv.push('--recursive')
        return argv
      },
    },
    code: {
      help: 'Open a codespace in VS Code (desktop by default; web=true for vscode.com).',
      needs: ['codespace'],
      argv: (a) => {
        const argv = ['codespace', 'code', '--codespace', a.codespace]
        if (a.web) argv.push('--web')
        return argv
      },
    },
    stop: {
      help: 'Stop a running codespace (requires `codespace`).',
      needs: ['codespace'],
      argv: (a) => ['codespace', 'stop', '--codespace', a.codespace],
    },
    rebuild: {
      help: 'DESTRUCTIVE: rebuild a codespace — unsaved work in the container is lost (full=true wipes completely).',
      needs: ['codespace'],
      destructive: true,
      argv: (a) => {
        const argv = ['codespace', 'rebuild', '--codespace', a.codespace]
        if (a.full) argv.push('--full')
        return argv
      },
    },
    logs: {
      help: 'Stream a codespace\'s creation/boot logs (requires `codespace`; long timeout).',
      needs: ['codespace'],
      watch: true,
      json: false,
      argv: (a) => {
        const argv = ['codespace', 'logs', '--codespace', a.codespace]
        if (a.follow) argv.push('--follow')
        return argv
      },
    },
    delete: {
      help: 'DESTRUCTIVE: delete a codespace permanently.',
      needs: ['codespace'],
      destructive: true,
      argv: (a) => ['codespace', 'delete', '--codespace', a.codespace, '--force'],
    },
  },
}
