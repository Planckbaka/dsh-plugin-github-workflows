## Summary

<!-- What does this PR change, and why? Link the issue it closes (Closes #N) when applicable. -->

## Type of change

- [ ] `feat` — new tool/action/capability
- [ ] `fix` — bug fix
- [ ] `docs` / `chore` / `ci` / `refactor` / `test`

## Checklist

- [ ] `npm test` passes locally
- [ ] `npm run test:integration` passes locally
- [ ] New/changed parameters go through `lib/schema.js` helpers (dsh-tools JSON-Schema subset only)
- [ ] Destructive behavior is confirm-gated (`confirm: true` + `allowDestructive`)
- [ ] No secret ever appears in argv (stdin or env only)
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] gh flags verified against `gh <cmd> --help` on the minimum supported gh version
