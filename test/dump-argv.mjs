import pr from '../lib/domains/pr.js'
import rel from '../lib/domains/release.js'
import act from '../lib/domains/actions.js'
import cs from '../lib/domains/codespace.js'
import cm from '../lib/domains/commit.js'
const cfg = { defaultRepo: '', timeoutMs: 60000 }
const show = (label, argv) => console.log(label.padEnd(16), Array.isArray(argv) ? 'gh ' + argv.join(' ') : 'ERROR: ' + argv.error)
show('pr create', pr.actions.create.argv({ title: 'Add feature', body: 'Fixes #1', base: 'main', head: 'feat/x', reviewers: ['alice'], draft: true }, cfg))
show('pr merge', pr.actions.merge.argv({ number: 42, mergeMethod: 'squash', deleteBranch: true }, cfg))
show('release create', rel.actions.create.argv({ tag: 'v1.2.0', title: 'v1.2.0', generateNotes: true, draft: true, assets: ['dist/app.zip'] }, cfg))
show('dispatch', act.actions.workflow_dispatch.argv({ workflow: 'ci.yml', ref: 'main', inputs: ['logLevel=debug'] }, cfg))
show('run view log', act.actions.run_view.argv({ runId: 12345, log: true }, cfg))
show('cs ssh', cs.actions.ssh.argv({ codespace: 'fancy-gopher', command: 'ls -la /work' }, cfg))
show('commit list', cm.actions.list.argv({ limit: 10 }, cfg, 'octocat/hello-world'))
show('commit compare', cm.actions.compare.argv({ base: 'main', head: 'dev' }, cfg, 'octocat/hello-world'))
show('cli blocked', (await import('../lib/domains/cli.js')).default.actions.run.argv({ args: ['auth', 'login'] }, cfg))
