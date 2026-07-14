import { createHash } from 'node:crypto'
import path from 'node:path'

import {
  advanceWorkspaceState,
  createInitialWorkspaceState,
} from '@codebuff/common/types/workspace-state'

import { LocalHarnessStore } from './local-harness-store'
import { resolveWorkspaceIdentity } from './repository-identity'

import type { LocalHarnessRecord } from './local-harness-store'
import type {
  WorkspaceChangeAction,
  WorkspaceStateV1,
} from '@codebuff/common/types/workspace-state'

type WorkspaceJournalRecord = LocalHarnessRecord & {
  state: WorkspaceStateV1
}

function fallbackIdentity(cwd: string) {
  const canonical = path.resolve(cwd)
  const digest = createHash('sha256').update(canonical).digest('hex').slice(0, 24)
  return { repositoryId: digest, workspaceId: digest }
}

export class WorkspaceJournalService {
  private constructor(
    private readonly store: LocalHarnessStore,
    readonly repositoryId: string,
    readonly workspaceId: string,
  ) {}

  static async create(params: {
    rootDir: string
    cwd: string
  }): Promise<WorkspaceJournalService> {
    const identity = await resolveWorkspaceIdentity({ cwd: params.cwd }).catch(
      () => fallbackIdentity(params.cwd),
    )
    return new WorkspaceJournalService(
      new LocalHarnessStore(params.rootDir),
      identity.repositoryId,
      identity.workspaceId,
    )
  }

  read(): WorkspaceStateV1 {
    const record = this.store.read(
      this.repositoryId,
      'workspace-journals',
      'workspace',
    ) as WorkspaceJournalRecord | undefined
    return record?.state ?? createInitialWorkspaceState()
  }

  advance(params: {
    runId: string
    source: string
    operationId?: string
    receiptId?: string
    actions: WorkspaceChangeAction[]
  }): WorkspaceStateV1 {
    return this.store.withKindLock(
      this.repositoryId,
      'workspace-journals',
      () => {
        const existing = this.store.read(
          this.repositoryId,
          'workspace-journals',
          'workspace',
        ) as WorkspaceJournalRecord | undefined
        const current = existing?.state ?? createInitialWorkspaceState()
        const state = advanceWorkspaceState(current, params)
        const timestamp = new Date(state.updatedAt).toISOString()
        this.store.put(
          'workspace-journals',
          {
            schemaVersion: 1,
            id: 'workspace',
            revision: existing ? existing.revision + 1 : 0,
            repositoryId: this.repositoryId,
            workspaceId: this.workspaceId,
            runId: params.runId || 'unknown-run',
            snapshotId: state.snapshotId,
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
            state,
          },
          existing?.revision,
        )
        return state
      },
    )
  }
}
