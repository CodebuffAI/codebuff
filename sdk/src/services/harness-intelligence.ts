import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { LocalHarnessStore } from './local-harness-store'

import type { LocalHarnessRecord } from './local-harness-store'

export type EnvironmentInspection = {
  cwd: string
  packageManager?: string
  manifests: string[]
  lockfiles: string[]
  tools: Record<string, { available: boolean; version?: string }>
}

const manifestNames = [
  'package.json',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Package.swift',
]
const lockfileNames = [
  'bun.lock',
  'bun.lockb',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'uv.lock',
  'poetry.lock',
  'Cargo.lock',
  'go.sum',
]

function toolVersion(command: string, args = ['--version']): {
  available: boolean
  version?: string
} {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 3_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error || result.status !== 0) return { available: false }
  const version = `${result.stdout ?? ''}${result.stderr ?? ''}`
    .trim()
    .split('\n')[0]
  return { available: true, ...(version ? { version } : {}) }
}

export function inspectHarnessEnvironment(cwd: string): EnvironmentInspection {
  const root = path.resolve(cwd)
  const manifests = manifestNames.filter((name) =>
    fs.existsSync(path.join(root, name)),
  )
  const lockfiles = lockfileNames.filter((name) =>
    fs.existsSync(path.join(root, name)),
  )
  const packageManager = fs.existsSync(path.join(root, 'bun.lock')) ||
    fs.existsSync(path.join(root, 'bun.lockb'))
    ? 'bun'
    : fs.existsSync(path.join(root, 'pnpm-lock.yaml'))
      ? 'pnpm'
      : fs.existsSync(path.join(root, 'yarn.lock'))
        ? 'yarn'
        : fs.existsSync(path.join(root, 'package-lock.json'))
          ? 'npm'
          : undefined
  return {
    cwd: root,
    ...(packageManager ? { packageManager } : {}),
    manifests,
    lockfiles,
    tools: {
      git: toolVersion('git'),
      bun: toolVersion('bun'),
      node: toolVersion('node'),
      python: toolVersion('python3'),
      rust: toolVersion('rustc'),
      go: toolVersion('go', ['version']),
      k6: toolVersion('k6'),
    },
  }
}

export type AffectedTestTarget = {
  source: string
  candidates: string[]
  packageRoot: string
}

export function getAffectedTestTargets(
  cwd: string,
  files: string[],
): AffectedTestTarget[] {
  return files.map((source) => {
    const normalized = source.replace(/\\/g, '/')
    const extension = path.extname(normalized)
    const stem = normalized.slice(0, -extension.length)
    const directory = path.posix.dirname(normalized)
    const basename = path.posix.basename(stem)
    const candidates = [
      `${stem}.test${extension}`,
      `${stem}.spec${extension}`,
      `${directory}/__tests__/${basename}.test${extension}`,
      `${directory}/__tests__/${basename}.spec${extension}`,
    ].filter((candidate) => fs.existsSync(path.join(cwd, candidate)))
    const segments = normalized.split('/')
    const packageRoot =
      segments[0] === 'packages' && segments[1]
        ? `packages/${segments[1]}`
        : segments.length > 1
          ? segments[0]
          : '.'
    return { source: normalized, candidates, packageRoot }
  })
}

export type BuildTarget = {
  packageRoot: string
  scripts: string[]
  manifest: string
}

export function getBuildTargets(cwd: string, files: string[]): BuildTarget[] {
  const roots = new Set(
    getAffectedTestTargets(cwd, files).map((target) => target.packageRoot),
  )
  const targets: BuildTarget[] = []
  for (const packageRoot of roots) {
    const manifest = path.join(cwd, packageRoot, 'package.json')
    if (!fs.existsSync(manifest)) continue
    const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8')) as {
      scripts?: Record<string, string>
    }
    const scripts = ['typecheck', 'test', 'lint', 'build'].filter(
      (script) => parsed.scripts?.[script],
    )
    targets.push({
      packageRoot,
      scripts,
      manifest: path.relative(cwd, manifest).replace(/\\/g, '/'),
    })
  }
  return targets
}

export type ContextPacketItem = {
  path: string
  symbols: string[]
  reason: string
  confidence: 'confirmed' | 'inferred' | 'unknown'
  freshnessHash?: string
}

export function createContextPacket(params: {
  objective: string
  acceptanceCriteria: string[]
  items: ContextPacketItem[]
  excluded: string[]
}): {
  id: string
  objective: string
  acceptanceCriteria: string[]
  items: ContextPacketItem[]
  excluded: string[]
} {
  const canonical = JSON.stringify(params)
  return {
    id: createHash('sha256').update(canonical).digest('hex'),
    ...params,
  }
}

export type KnowledgeRecord = LocalHarnessRecord & {
  statement: string
  source: string
  sourceHash: string
  verifiedAt: string
  expiresAt?: string
}

export class VerifiedKnowledgeService {
  constructor(private readonly store: LocalHarnessStore) {}

  record(params: {
    repositoryId: string
    workspaceId: string
    runId: string
    snapshotId: string
    statement: string
    source: string
    sourceHash: string
    verifiedAt: string
    expiresAt?: string
  }): KnowledgeRecord {
    const timestamp = new Date().toISOString()
    return this.store.put('artifacts', {
      schemaVersion: 1,
      id: `knowledge-${randomUUID()}`,
      revision: 0,
      repositoryId: params.repositoryId,
      workspaceId: params.workspaceId,
      runId: params.runId,
      snapshotId: params.snapshotId,
      createdAt: timestamp,
      updatedAt: timestamp,
      statement: params.statement,
      source: params.source,
      sourceHash: params.sourceHash,
      verifiedAt: params.verifiedAt,
      ...(params.expiresAt ? { expiresAt: params.expiresAt } : {}),
    }) as KnowledgeRecord
  }

  listFresh(repositoryId: string, at = Date.now()): KnowledgeRecord[] {
    return this.store
      .list(repositoryId, 'artifacts')
      .filter((record) => record.id.startsWith('knowledge-'))
      .filter(
        (record) =>
          typeof record.expiresAt !== 'string' || Date.parse(record.expiresAt) > at,
      ) as KnowledgeRecord[]
  }
}

export type WorkspaceLeaseRecord = LocalHarnessRecord & {
  taskId: string
  path: string
  branch?: string
  ownershipToken: string
  heartbeatAt: string
  status: 'active' | 'released' | 'abandoned'
}

export class WorkspaceLeaseService {
  constructor(private readonly store: LocalHarnessStore) {}

  acquire(params: {
    repositoryId: string
    workspaceId: string
    runId: string
    snapshotId: string
    taskId: string
    path: string
    branch?: string
  }): WorkspaceLeaseRecord {
    const active = this.store
      .list(params.repositoryId, 'workspaces')
      .find(
        (record) =>
          record.status === 'active' &&
          (record.workspaceId === params.workspaceId || record.path === params.path),
      )
    if (active) throw new Error(`Workspace is already leased by run '${active.runId}'.`)
    const timestamp = new Date().toISOString()
    return this.store.put('workspaces', {
      schemaVersion: 1,
      id: `workspace-${params.workspaceId}`,
      revision: 0,
      ...params,
      createdAt: timestamp,
      updatedAt: timestamp,
      ownershipToken: randomUUID(),
      heartbeatAt: timestamp,
      status: 'active',
    }) as WorkspaceLeaseRecord
  }

  release(repositoryId: string, id: string, ownershipToken: string): WorkspaceLeaseRecord {
    const existing = this.store.read(repositoryId, 'workspaces', id) as
      | WorkspaceLeaseRecord
      | undefined
    if (!existing) throw new Error('Workspace lease not found.')
    if (existing.ownershipToken !== ownershipToken) {
      throw new Error('Workspace ownership token does not match.')
    }
    const timestamp = new Date().toISOString()
    return this.store.put(
      'workspaces',
      {
        ...existing,
        revision: existing.revision + 1,
        updatedAt: timestamp,
        heartbeatAt: timestamp,
        status: 'released',
      },
      existing.revision,
    ) as WorkspaceLeaseRecord
  }
}

export type ConnectorOperation = 'read' | 'mutation'

export function classifyConnectorOperation(params: {
  connector: string
  operation: string
}): { kind: ConnectorOperation; approvalRequired: boolean } {
  const mutationPattern = /create|update|delete|send|post|push|merge|deploy|release|publish|trigger|cancel/i
  const kind: ConnectorOperation = mutationPattern.test(params.operation)
    ? 'mutation'
    : 'read'
  return { kind, approvalRequired: kind === 'mutation' }
}
