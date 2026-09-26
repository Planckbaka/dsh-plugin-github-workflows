name: 🐛 Bug report
description: Something does not work as expected
labels: [bug]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for reporting! Before filing, run `npm test` in a checkout to
        check whether the latest `main` already fixes it.
  - type: input
    id: plugin-version
    attributes:
      label: Plugin version
      description: Shown on the plugin card, or the repo tag you installed from
      placeholder: v0.2.1
    validations:
      required: true
  - type: input
    id: versions
    attributes:
      label: Environment
      description: DSH version, gh version (`gh --version`), OS
      placeholder: "DSH 0.1.7-rc.2, gh 2.86.0, Windows 11"
    validations:
      required: true
  - type: input
    id: tool-action
    attributes:
      label: Tool + action
      description: Which github_* tool and which action enum value
      placeholder: "github_pr / merge"
    validations:
      required: true
  - type: textarea
    id: what-happened
    attributes:
      label: What happened?
      description: Paste the tool result (command line, exit code, stderr). Tokens are never printed — if one appears, report it via Security instead.
      placeholder: |
        $ gh pr merge 42 --squash
        ✗ exit 1 · 0.8s
        [stderr] ...
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: What did you expect?
    validations:
      required: true
  - type: textarea
    id: config
    attributes:
      label: Relevant config (optional)
      description: Non-secret parts of your cordis.patch.yml config for the plugin
