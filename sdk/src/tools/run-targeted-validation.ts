import { getChangeReviewBundle } from './get-change-review-bundle'
import { runFileChangeHooks } from './file-change-hooks'

import type { CodebuffToolOutput } from '../../../common/src/tools/list'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type { WorkspaceStateV1 } from '@codebuff/common/types/workspace-state'

function bundleValue(
  output: Awaited<ReturnType<typeof getChangeReviewBundle>>,
):
  | {
      snapshotId: string
      workspaceRevision?: number
      workspaceSnapshotId?: string
    }
  | { errorMessage: string } {
  const value = output[0]?.type === 'json' ? output[0].value : undefined
  return value && 'snapshotId' in value
    ? {
        snapshotId: value.snapshotId,
        workspaceRevision: value.workspaceRevision,
        workspaceSnapshotId: value.workspaceSnapshotId,
      }
    : {
        errorMessage:
          value && 'errorMessage' in value
            ? value.errorMessage
            : 'Unable to attest validation snapshot.',
      }
}

export async function runTargetedValidation(params: {
  cwd: string
  snapshotId: string
  files: string[]
  artifactKinds?: string[]
  env?: NodeJS.ProcessEnv
  signal?: AbortSignal
  fileSystem?: CodebuffFileSystem
  runHooks?: typeof runFileChangeHooks
  workspaceState?: WorkspaceStateV1
}): Promise<CodebuffToolOutput<'run_targeted_validation'>> {
  const artifactKinds = params.artifactKinds ?? []
  const before = bundleValue(
    await getChangeReviewBundle({
      cwd: params.cwd,
      workspaceState: params.workspaceState,
      signal: params.signal,
    }),
  )
  if ('errorMessage' in before || before.snapshotId !== params.snapshotId) {
    return [
      {
        type: 'json',
        value: {
          schemaVersion: 1,
          snapshotId:
            'snapshotId' in before ? before.snapshotId : params.snapshotId,
          workspaceRevision:
            'workspaceRevision' in before
              ? before.workspaceRevision
              : params.workspaceState?.revision,
          workspaceSnapshotId:
            'workspaceSnapshotId' in before
              ? before.workspaceSnapshotId
              : params.workspaceState?.snapshotId,
          files: params.files,
          artifactKinds,
          status: 'failed',
          assurance: 'none',
          summary:
            'Validation refused because the requested snapshot is stale or unavailable.',
          results: [],
        },
      },
    ]
  }
  const hookOutput = await (params.runHooks ?? runFileChangeHooks)({
    files: params.files,
    cwd: params.cwd,
    env: params.env,
    signal: params.signal,
    fileSystem: params.fileSystem,
  })
  const results = hookOutput.flatMap((part) =>
    part.type === 'json' && Array.isArray(part.value) ? part.value : [],
  ) as Array<Record<string, unknown>>
  const after = bundleValue(
    await getChangeReviewBundle({
      cwd: params.cwd,
      workspaceState: params.workspaceState,
      signal: params.signal,
    }),
  )
  const snapshotChanged =
    'errorMessage' in after || after.snapshotId !== before.snapshotId
  const failed = results.some(
    (result) =>
      (typeof result.exitCode === 'number' && result.exitCode !== 0) ||
      typeof result.errorMessage === 'string' ||
      result.permissionDenied === true,
  )
  const skipped =
    results.length === 0 ||
    results.every((result) =>
      ['no_hooks_configured', 'hooks_skipped'].includes(
        typeof result.validationStatus === 'string'
          ? result.validationStatus
          : '',
      ),
    )
  const status =
    snapshotChanged || failed ? 'failed' : skipped ? 'skipped' : 'passed'
  return [
    {
      type: 'json',
      value: {
        schemaVersion: 1,
        snapshotId: before.snapshotId,
        workspaceRevision: before.workspaceRevision,
        workspaceSnapshotId: before.workspaceSnapshotId,
        files: params.files,
        artifactKinds,
        status,
        assurance:
          snapshotChanged || failed ? 'none' : skipped ? 'reduced' : 'full',
        summary: snapshotChanged
          ? 'Validation evidence rejected because the worktree changed during validation.'
          : failed
            ? 'One or more targeted validation checks failed.'
            : skipped
              ? 'No matching configured validation checks ran.'
              : 'Targeted validation checks passed for the attested snapshot.',
        results,
      },
    },
  ]
}
