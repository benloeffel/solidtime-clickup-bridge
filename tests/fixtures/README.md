# ClickUp DOM fixtures

`synthetic/` are hand-written pages that reproduce the ClickUp markup the
extension relies on (see `src/clickup/selectors.ts`). They keep tests
deterministic and are what CI runs against.

`captured/` (git-ignored contents except this note) is where
`npm run capture-fixtures` saves real, sanitised ClickUp pages from your
own session. The DOM tests also run against any captured file whose name starts
with `task-` or `list-`, which is the fastest way to tell whether a ClickUp
UI update broke a selector.
