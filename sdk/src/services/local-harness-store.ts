import fs from 'node:fs'
import path from 'node:path'

import { z } from 'zod/v4'

const recordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  revision: z.number().int().nonnegative(),
  repositoryId: z.string().min(1),
  workspaceId: z.string().min(1),
  runId: z.string().min(1),
  snapshotId: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
})

export type LocalHarnessRecord = z.infer<typeof recordSchema> &
  Record<string, unknown>

export type HarnessRecordKind =
  | 'tasks'
  | 'workspaces'
  | 'snapshots'
  | 'artifacts'
  | 'ownership'
  | 'validation'
  | 'findings'
  | 'approvals'

const recordKinds: HarnessRecordKind[] = [
  'tasks',
  'workspaces',
  'snapshots',
  'artifacts',
  'ownership',
  'validation',
  'findings',
  'approvals',
]

function assertSafeSegment(value: string, label: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) {
    throw new Error(`Invalid harness ${label} '${value}'.`)
  }
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  })
  fs.renameSync(tempPath, filePath)
}

export class LocalHarnessStore {
  readonly rootDir: string

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir)
  }

  private recordPath(
    repositoryId: string,
    kind: HarnessRecordKind,
    id: string,
  ): string {
    assertSafeSegment(repositoryId, 'repository id')
    assertSafeSegment(id, 'record id')
    if (!recordKinds.includes(kind)) {
      throw new Error(`Invalid harness record kind '${kind}'.`)
    }
    return path.join(this.rootDir, repositoryId, kind, `${id}.json`)
  }

  read(
    repositoryId: string,
    kind: HarnessRecordKind,
    id: string,
  ): LocalHarnessRecord | undefined {
    const filePath = this.recordPath(repositoryId, kind, id)
    if (!fs.existsSync(filePath)) return undefined
    const parsed = recordSchema.passthrough().safeParse(
      JSON.parse(fs.readFileSync(filePath, 'utf8')),
    )
    if (!parsed.success) {
      throw new Error(
        `Invalid harness record at ${filePath}: ${parsed.error.message}`,
      )
    }
    return parsed.data
  }

  list(
    repositoryId: string,
    kind: HarnessRecordKind,
  ): LocalHarnessRecord[] {
    assertSafeSegment(repositoryId, 'repository id')
    const dir = path.join(this.rootDir, repositoryId, kind)
    if (!fs.existsSync(dir)) return []
    return fs
      .readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => this.read(repositoryId, kind, name.slice(0, -5))!)
  }

  put<T extends LocalHarnessRecord>(
    kind: HarnessRecordKind,
    record: T,
    expectedRevision?: number,
  ): T {
    const parsed = recordSchema.passthrough().parse(record) as T
    const existing = this.read(parsed.repositoryId, kind, parsed.id)
    if (existing) {
      if (expectedRevision === undefined) {
        throw new Error(
          `Harness record '${parsed.id}' already exists; expectedRevision is required.`,
        )
      }
      if (existing.revision !== expectedRevision) {
        throw new Error(
          `Harness record revision conflict: expected ${expectedRevision}, current ${existing.revision}.`,
        )
      }
      if (parsed.revision !== existing.revision + 1) {
        throw new Error(
          `Harness record '${parsed.id}' must advance revision from ${existing.revision} to ${existing.revision + 1}.`,
        )
      }
      if (existing.repositoryId !== parsed.repositoryId) {
        throw new Error('Harness records cannot move between repositories.')
      }
    } else if (parsed.revision !== 0) {
      throw new Error('New harness records must start at revision 0.')
    }
    writeJsonAtomic(
      this.recordPath(parsed.repositoryId, kind, parsed.id),
      parsed,
    )
    return parsed
  }
}
