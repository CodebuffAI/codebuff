import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

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

const LOCK_WAIT_MS = 10
const LOCK_TIMEOUT_MS = 5_000
const LOCK_STALE_MS = 30_000
const lockWaitArray = new Int32Array(new SharedArrayBuffer(4))

export type HarnessStoreDiagnostic = {
  filePath: string
  message: string
  quarantinedPath?: string
}

function assertSafeSegment(value: string, label: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) {
    throw new Error(`Invalid harness ${label} '${value}'.`)
  }
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 })
  const tempPath = `${filePath}.tmp.${process.pid}.${randomUUID()}`
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

  private kindDirectory(
    repositoryId: string,
    kind: HarnessRecordKind,
  ): string {
    assertSafeSegment(repositoryId, 'repository id')
    if (!recordKinds.includes(kind)) {
      throw new Error(`Invalid harness record kind '${kind}'.`)
    }
    return path.join(this.rootDir, repositoryId, kind)
  }

  private withFilesystemLock<T>(lockPath: string, operation: () => T): T {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 })
    const startedAt = Date.now()
    while (true) {
      try {
        fs.mkdirSync(lockPath, { mode: 0o700 })
        fs.writeFileSync(
          path.join(lockPath, 'owner.json'),
          JSON.stringify({ pid: process.pid, acquiredAt: Date.now() }),
          { mode: 0o600 },
        )
        break
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'EEXIST') throw error
        try {
          const age = Date.now() - fs.statSync(lockPath).mtimeMs
          if (age > LOCK_STALE_MS) {
            fs.rmSync(lockPath, { recursive: true, force: true })
            continue
          }
        } catch (statError) {
          if ((statError as NodeJS.ErrnoException).code === 'ENOENT') continue
          throw statError
        }
        if (Date.now() - startedAt >= LOCK_TIMEOUT_MS) {
          throw new Error(`Timed out acquiring harness store lock '${lockPath}'.`)
        }
        Atomics.wait(lockWaitArray, 0, 0, LOCK_WAIT_MS)
      }
    }

    try {
      return operation()
    } finally {
      fs.rmSync(lockPath, { recursive: true, force: true })
    }
  }

  withKindLock<T>(
    repositoryId: string,
    kind: HarnessRecordKind,
    operation: () => T,
  ): T {
    const dir = this.kindDirectory(repositoryId, kind)
    return this.withFilesystemLock(`${dir}.lock`, operation)
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
    return this.listWithDiagnostics(repositoryId, kind).records
  }

  listWithDiagnostics(
    repositoryId: string,
    kind: HarnessRecordKind,
  ): { records: LocalHarnessRecord[]; diagnostics: HarnessStoreDiagnostic[] } {
    const dir = this.kindDirectory(repositoryId, kind)
    if (!fs.existsSync(dir)) return { records: [], diagnostics: [] }
    const records: LocalHarnessRecord[] = []
    const diagnostics: HarnessStoreDiagnostic[] = []
    for (const name of fs
      .readdirSync(dir)
      .filter((entry) => entry.endsWith('.json'))
      .sort()) {
      const filePath = path.join(dir, name)
      try {
        const record = this.read(repositoryId, kind, name.slice(0, -5))
        if (record) records.push(record)
      } catch (error) {
        const quarantineDir = path.join(dir, '.corrupt')
        const quarantinedPath = path.join(
          quarantineDir,
          `${name}.${Date.now()}.${randomUUID()}`,
        )
        try {
          fs.mkdirSync(quarantineDir, { recursive: true, mode: 0o700 })
          fs.renameSync(filePath, quarantinedPath)
          diagnostics.push({
            filePath,
            quarantinedPath,
            message: error instanceof Error ? error.message : String(error),
          })
        } catch (quarantineError) {
          diagnostics.push({
            filePath,
            message: `${error instanceof Error ? error.message : String(error)}; quarantine failed: ${quarantineError instanceof Error ? quarantineError.message : String(quarantineError)}`,
          })
        }
      }
    }
    return { records, diagnostics }
  }

  put<T extends LocalHarnessRecord>(
    kind: HarnessRecordKind,
    record: T,
    expectedRevision?: number,
  ): T {
    const parsed = recordSchema.passthrough().parse(record) as T
    const filePath = this.recordPath(parsed.repositoryId, kind, parsed.id)
    return this.withFilesystemLock(`${filePath}.lock`, () => {
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
      writeJsonAtomic(filePath, parsed)
      return parsed
    })
  }
}
