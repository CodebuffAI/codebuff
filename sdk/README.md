# Openbuff SDK

Openbuff is a local-first, BYOK coding-agent SDK. Filesystem tools run against
the host-provided `CodebuffFileSystem`; provider credentials and model routing
remain under the host's control.

## Recommended filesystem setup

New runs default to structured `read_files` v1 results. Use
`filesystemResultFormat: 'legacy-v0'` only for an existing compatibility
integration. During agent runs, complete reads carry authenticated `cap.v3`
tokens bound to the current project, normalized path, and run; SDK callers
should treat them as opaque and copy them only to the matching edit target.

When `run()` receives a `cwd` and no custom `fsSource`, the SDK creates a
workspace-scoped mutation broker under the harness state directory. The broker
supplies bounded line-range reads plus cooperative, inter-process conditional
commit/delete/move and exclusive-create authority:

```ts
import { run } from '@openbuff/sdk'

await run({
  cwd: process.cwd(),
  filesystemResultFormat: 'structured-v1',
  agent: 'base2',
  prompt: 'Update the project',
})
```

`createNodeFileSystem()` used by itself intentionally omits conditional
mutations and makes guarded updates fail closed. Hosts that need the same
brokered adapter outside `run()` can construct it explicitly:

```ts
import { createNodeFileSystem, WorkspaceMutationBroker } from '@openbuff/sdk'

const mutationBroker = await WorkspaceMutationBroker.create({
  cwd: process.cwd(),
  stateDir: '/path/to/openbuff/state/harness',
})
const fsSource = createNodeFileSystem({ mutationBroker })
```

This is cooperative CAS among participating Openbuff processes, not absolute
kernel-enforced filesystem CAS. External editors can bypass the broker, so
workspace revision checks and filesystem watching remain the backstop for
outside mutations.

Custom adapters should implement the optional capabilities they can guarantee:

- `readTextRange` enables bounded reads of files larger than 10 MB.
- `createFileExclusive` prevents create collisions.
- `conditionalCommit` prevents lost updates between validation and overwrite.
- `conditionalDelete` guards deletions with an exact-byte expected hash.
- `conditionalMove` requires the source hash and an absent destination.

Tools that require a host process, such as terminal commands and configured
validation hooks, are separate from the filesystem adapter. Virtual or remote
hosts should override or disable process-backed tools when the local process
does not represent the same workspace.

## High-impact action approvals

Approval behavior is controlled by `approvalMode`:

- `balanced` (default) allows routine dependency changes, commits, feature
  branch pushes, pull requests, and ordinary downloads without prompting. It
  asks only for destructive workspace/history changes, default-branch pushes,
  deployments, releases, migrations, uploads/remote shells, and arbitrary code
  evaluation.
- `strict` asks for every classified package, Git, remote, or destructive
  effect.
- `allow-all` auto-approves classified effects while retaining non-negotiable
  project containment, secret filtering, no global/system installs, staged
  path ownership, and no force/delete pushes.

When approval is required, hosts can provide `requestApproval`; the callback
pauses the same tool call and returns a decision. Approved actions receive a
single-use receipt bound to the repository, workspace, root run, exact action
target, and current workspace snapshot, then continue immediately.

The CLI wires `requestApproval` to its existing in-run question UI. SDK hosts
may instead pre-create receipts with `HarnessApprovalService` and pass their IDs
through `approvalReceiptIds`. A receipt for a different command, run,
workspace, or snapshot is rejected; an agent cannot mint or broaden its own
approval.

## Terminal command permission profiles

`run_terminal_command` is gated by the exported
`evaluateTerminalCommandPolicy` helper, which decides whether a command may
run under an agent's permission profile. Hosts can call it directly to
evaluate the same policy outside the tool:

```ts
const decision = evaluateTerminalCommandPolicy({
  command: 'git status',
  mode: 'assistant',
  permissionProfile: 'git-commit',
  projectRoot: process.cwd(),
  allowedPaths: ['src/index.ts'],
})
// decision: { allowed: true } | { allowed: false, reason: string }
```

Inputs:

- `command` — the shell command line to evaluate.
- `mode` — `'assistant'` enforces the policy; `'user'` is always allowed
  (direct user input is not gated here).
- `permissionProfile` — one of the profiles below.
- `projectRoot` — the workspace root used for path-containment checks.
- `allowedPaths` — optional owned-path allowlist, required for `git add`
  staging under `git-commit`.

Profiles:

- `read-only` — inspection only. Blocks filesystem, Git, dependency, network,
  package/system, deployment, and process mutations, shell interpreter
  escapes, and unsafe redirection. `/dev/null` and file-descriptor redirects
  are tolerated.
- `librarian-read-only` — `read-only` plus a single narrow exception: a
  depth-1 `git clone` of a GitHub repo into a `/tmp/librarian-…` directory.
- `validation-diagnosis` — `read-only` relaxed for debugging: in-project `..`
  references are allowed (segments that escape the project root are still
  rejected), and `>`/`>>`/heredoc writes are permitted only to plain,
  expansion-free paths that resolve inside the project.
- `git-commit` — inspect/fetch Git state, stage explicit owned paths, create a
  non-`--amend` commit with `-m`, and perform an explicit non-force branch
  push. `git add` paths must be an exact subset of `allowedPaths`; broad
  flags, dot staging, options, and globs are forbidden. No shell composition
  or substitution.
- `dependency-mutation` — supported ecosystem dependency operations only
  (npm/pnpm/yarn/bun, uv/poetry, pip, cargo, go, dotnet, bundler, composer,
  swift, dart/flutter, mix, maven, gradle). Global/user-level installs, shell
  composition, and multi-line commands are blocked.
- `tmux-test` — may write only explicit `/tmp` fixtures and captures, not
  workspace files; outside-absolute-path containment still applies.
- `workspace-write` — general workspace writes; in-project `..` references are
  allowed, escaping segments are rejected.
- `full-access` — bypasses the policy gates. Use only through an explicit
  full-access workflow.

Containment applied to every non-`full-access` profile, including `tmux-test`:
path traversal (`..` segments, per the profile rules above) and absolute paths
that resolve outside the project root (with `/tmp`, `/bin`, `/usr/bin`, and
`/dev/null` exempted) are always denied.

In addition, every non-`full-access` profile except `tmux-test` always denies
privilege escalation (`sudo`/`su`), system package managers, root deletion,
environment dumping, force/delete pushes, and shell indirection
(`eval`/`source`/`<shell> -c`). The `tmux-test` profile skips these workspace
deny patterns because it is governed by its own stricter `/tmp`-only write
guard described above. When a command is denied, `reason` names the specific
rule that blocked it.

## Mutation events

Use `onFilesystemMutation` for precise, awaited cache/index synchronization.
It receives the tool/call/operation identity and confirmed paths, actions, and
hashes. `onFilesChanged` remains as a compatibility callback.

External mutation overrides are conservatively reported as `unconfirmed`
unless the host supplies `verifyExternalMutation` and attests the canonical v1
result. This keeps remote-workspace integrations possible without trusting
self-certified mutation results by default.

## Result and cancellation semantics

- `applied` means the SDK verified final state and issued an authority receipt.
- `not_applied` means authority proved no requested action was committed.
- `unconfirmed` means the host or compatibility boundary cannot establish disk
  state; re-read before retrying.
- Run interruption and filesystem outcome are separate. A mutation may report
  an authoritative result after the run is interrupted.
- Native reads, images, patches, and validation hooks receive the run abort
  signal. Once a portable filesystem commit has started, hosts must still use
  the returned canonical result to determine final disk state.

## Public helpers

The root package exports structured read helpers, mutation helpers,
`FilesystemAuthority`, capability detection/types, the Node adapter, and the
complete `ToolHelpers` namespace. Override descriptor/context types are also
public for reusable host integrations.
