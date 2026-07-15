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

Assistant-originated dependency mutation, pushes, releases, migrations,
deployments, pull-request mutation, and recursive workspace deletion require a
single-use approval receipt in addition to the agent's static terminal
permission profile. Approval never widens that profile. Receipts are bound to
the repository, workspace, root run, exact action target, and current workspace
snapshot, then consumed atomically before execution.

Hosts create receipts with the exported `WorkspaceJournalService`,
`LocalHarnessStore`, and `HarnessApprovalService`, then pass their IDs through
`approvalReceiptIds` on the resumed run. A receipt for a different command,
run, workspace, or snapshot is rejected; direct default-branch pushes remain
prohibited even with a receipt. This is intentionally a host-mediated flow—an
agent cannot mint or broaden its own approval.

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
