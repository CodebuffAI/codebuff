# E2E validation — strict read-before-edit fix

## What was fixed
- `write_file` now grants a one-shot `readAuthorizationsByPath[path] = true`
  after a successful write so a follow-up `str_replace` on the same path can
  proceed without a prior read.
- Lazy-init via `??= {}` mirrors the canonical `read_files` initializer.
- Gated on `strictReadBeforeEdit` so legacy callers are unaffected.

## Why this matters
- Before the fix, every write→edit pair forced a redundant re-read.
- That re-read was the dominant strict-gate fail mode in the recent
  fail-rate audit.

## How this E2E validation was produced
- File created via the agent's `write_file` tool (new-file branch; auth
  not yet required).
- This follow-up `str_replace` is being applied **without a prior read
  of this file's content**, so it only succeeds if the runtime now
  grants auth from the prior successful write.
- No test, harness, or scripted run was used — this is a direct edit
  through the agent's normal edit pipeline.
