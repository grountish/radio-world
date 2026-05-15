# Agent Workflow

This repository keeps an explicit app version and a human-readable release log.

## Versioning Rule

For any medium or large product change:

1. Bump the app version only after the change is truly in place and verified well enough that it should count as a real release step.
2. Add a new release entry describing what changed.
3. Keep the newest release at the top and mark it as `current`.
4. Change the previous `current` entry label to something non-current such as `previous`.

## Source Of Truth

- App version: `src/lib/config/app-version.ts`
- Release history shown in the UI: `src/lib/config/app-version.ts`
- Package version: `package.json`

## Expected Update Steps

For a medium or large change, update all of these together:

1. `src/lib/config/app-version.ts`
2. `package.json`
3. Any user-facing release log surface that consumes that version history

Small local fixes, typo cleanups, and other tiny changes do not need a version bump unless the user asks for one.

Do not bump the version for an attempted fix that still needs a follow-up correction. Fold that correction into the original release entry once the fix actually works.
