name: ✨ Feature request
description: Suggest a new capability or an improvement
labels: [enhancement]
body:
  - type: textarea
    id: problem
    attributes:
      label: Problem
      description: What are you trying to do that the plugin makes hard or impossible today?
    validations:
      required: true
  - type: textarea
    id: solution
    attributes:
      label: Proposed solution
      description: Which tool/action should change, or what new action/domain would help? If it maps to a gh flag, name it.
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives you considered
      description: e.g. doing it via github_api, raw github_cli, or the shell
