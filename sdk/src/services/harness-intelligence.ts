import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { resolveProjectPath } from '@codebuff/common/util/project-path-containment'

import { LocalHarnessStore } from './local-harness-store'

import type { LocalHarnessRecord } from './local-harness-store'

export type EnvironmentInspection = {
  cwd: string
  packageManager?: string
  manifests: string[]
  lockfiles: string[]
  workspaces: Array<{
    root: string
    ecosystem: string
    manager: string
    manifest: string
    lockfile?: string
    confidence: 'confirmed' | 'inferred' | 'unknown'
  }>
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
  'requirements.txt',
  'setup.py',
  'setup.cfg',
]
const discoveryMarkerNames = ['gradlew', 'mvnw']
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
  'Pipfile.lock',
  'packages.lock.json',
]

const ignoredDiscoveryDirectories = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'target',
  'dist',
  'build',
  'out',
  '.next',
  '.turbo',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
])

function discoverNamedFiles(root: string): string[] {
  const wanted = new Set([
    ...manifestNames,
    ...lockfileNames,
    ...discoveryMarkerNames,
  ])
  const found: string[] = []
  const visit = (directory: string): void => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!ignoredDiscoveryDirectories.has(entry.name)) visit(absolute)
      } else if (
        wanted.has(entry.name) ||
        entry.name.endsWith('.csproj') ||
        entry.name.endsWith('.sln')
      ) {
        found.push(path.relative(root, absolute).replace(/\\/g, '/'))
      }
    }
  }
  visit(root)
  return found.sort()
}

function inferWorkspace(root: string, manifest: string, allFiles: Set<string>) {
  const directory =
    path.posix.dirname(manifest) === '.' ? '.' : path.posix.dirname(manifest)
  const at = (name: string) =>
    directory === '.' ? name : `${directory}/${name}`
  const closest = (names: readonly string[]): string | undefined => {
    let current = directory
    while (true) {
      for (const name of names) {
        const candidate = current === '.' ? name : `${current}/${name}`
        if (allFiles.has(candidate)) return candidate
      }
      if (current === '.') return undefined
      const parent = path.posix.dirname(current)
      current = parent === current ? '.' : parent
    }
  }
  const base = path.posix.basename(manifest)
  let ecosystem = 'unknown'
  let manager = 'unknown'
  let lockfile: string | undefined
  let confidence: 'confirmed' | 'inferred' | 'unknown' = 'inferred'
  if (base === 'package.json') {
    ecosystem = 'javascript'
    for (const [candidate, value] of [
      ['bun.lock', 'bun'],
      ['bun.lockb', 'bun'],
      ['pnpm-lock.yaml', 'pnpm'],
      ['yarn.lock', 'yarn'],
      ['package-lock.json', 'npm'],
    ] as const) {
      const discoveredLockfile = closest([candidate])
      if (discoveredLockfile) {
        lockfile = discoveredLockfile
        manager = value
        confidence = 'confirmed'
        break
      }
    }
    if (manager === 'unknown') {
      try {
        const parsed = JSON.parse(
          fs.readFileSync(path.join(root, manifest), 'utf8'),
        ) as { packageManager?: string }
        if (parsed.packageManager) {
          manager = parsed.packageManager.split('@')[0]
          confidence = 'confirmed'
        } else {
          manager = 'npm'
          confidence = 'inferred'
        }
      } catch {
        confidence = 'unknown'
      }
    }
  } else if (base === 'Cargo.toml') {
    ecosystem = 'rust'
    manager = 'cargo'
    lockfile = allFiles.has(at('Cargo.lock')) ? at('Cargo.lock') : undefined
    confidence = 'confirmed'
  } else if (base === 'go.mod') {
    ecosystem = 'go'
    manager = 'go'
    lockfile = allFiles.has(at('go.sum')) ? at('go.sum') : undefined
    confidence = 'confirmed'
  } else if (base === 'pom.xml') {
    ecosystem = 'java'
    manager = closest(['mvnw']) ? 'maven-wrapper' : 'maven'
    confidence = 'confirmed'
  } else if (base === 'build.gradle' || base === 'build.gradle.kts') {
    ecosystem = 'jvm'
    manager = closest(['gradlew']) ? 'gradle-wrapper' : 'gradle'
    confidence = 'confirmed'
  } else if (
    base === 'pyproject.toml' ||
    base === 'requirements.txt' ||
    base === 'setup.py' ||
    base === 'setup.cfg'
  ) {
    ecosystem = 'python'
    const pythonLockfile = closest(['uv.lock', 'poetry.lock', 'Pipfile.lock'])
    if (pythonLockfile?.endsWith('uv.lock')) {
      manager = 'uv'
      lockfile = pythonLockfile
      confidence = 'confirmed'
    } else if (pythonLockfile?.endsWith('poetry.lock')) {
      manager = 'poetry'
      lockfile = pythonLockfile
      confidence = 'confirmed'
    } else if (pythonLockfile?.endsWith('Pipfile.lock')) {
      manager = 'pipenv'
      lockfile = pythonLockfile
      confidence = 'confirmed'
    } else {
      manager = 'python'
      confidence = 'inferred'
    }
  } else if (base.endsWith('.csproj') || base.endsWith('.sln')) {
    ecosystem = 'dotnet'
    manager = 'dotnet'
    lockfile = allFiles.has(at('packages.lock.json'))
      ? at('packages.lock.json')
      : undefined
    confidence = 'confirmed'
  } else if (base === 'Package.swift') {
    ecosystem = 'swift'
    manager = 'swift'
    confidence = 'confirmed'
  }
  return {
    root: directory,
    ecosystem,
    manager,
    manifest,
    ...(lockfile ? { lockfile } : {}),
    confidence,
  }
}

function toolVersion(
  command: string,
  args = ['--version'],
): {
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
  const discovered = discoverNamedFiles(root)
  const discoveredSet = new Set(discovered)
  const manifests = discovered.filter((file) => {
    const base = path.posix.basename(file)
    return (
      manifestNames.includes(base) ||
      base.endsWith('.csproj') ||
      base.endsWith('.sln')
    )
  })
  const lockfiles = discovered.filter((file) =>
    lockfileNames.includes(path.posix.basename(file)),
  )
  const workspaces = manifests.map((manifest) =>
    inferWorkspace(root, manifest, discoveredSet),
  )
  const packageManager = workspaces.find(
    (workspace) =>
      workspace.root === '.' && workspace.ecosystem === 'javascript',
  )?.manager
  return {
    cwd: root,
    ...(packageManager ? { packageManager } : {}),
    manifests,
    lockfiles,
    workspaces,
    tools: {
      git: toolVersion('git'),
      bun: toolVersion('bun'),
      node: toolVersion('node'),
      python: toolVersion('python3'),
      rust: toolVersion('rustc'),
      go: toolVersion('go', ['version']),
      k6: toolVersion('k6'),
      cargo: toolVersion('cargo'),
      uv: toolVersion('uv'),
      poetry: toolVersion('poetry'),
      maven: toolVersion('mvn'),
      gradle: toolVersion('gradle'),
      dotnet: toolVersion('dotnet'),
      blender: toolVersion('blender'),
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
  const environment = inspectHarnessEnvironment(cwd)
  return files.flatMap((source) => {
    const resolvedSource = resolveProjectPath(cwd, source)
    if (!resolvedSource) return []
    const normalized = resolvedSource.relativePath.replace(/\\/g, '/')
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
    const packageRoot =
      environment.workspaces
        .filter(
          (workspace) =>
            workspace.root === '.' ||
            normalized === workspace.root ||
            normalized.startsWith(`${workspace.root}/`),
        )
        .sort((left, right) => right.root.length - left.root.length)[0]?.root ??
      '.'
    return [{ source: normalized, candidates, packageRoot }]
  })
}

export type BuildTarget = {
  packageRoot: string
  scripts: string[]
  manifest: string
  manager: string
  commands: string[]
  confidence: 'confirmed' | 'inferred' | 'unknown'
}

export function getBuildTargets(cwd: string, files: string[]): BuildTarget[] {
  const environment = inspectHarnessEnvironment(cwd)
  const targets: BuildTarget[] = []
  const normalizedFiles = files.flatMap((file) => {
    const resolved = resolveProjectPath(cwd, file)
    return resolved ? [resolved.relativePath.replace(/\\/g, '/')] : []
  })
  const selected = new Map<string, (typeof environment.workspaces)[number]>()
  for (const file of normalizedFiles) {
    const candidates = environment.workspaces
      .filter(
        (workspace) =>
          workspace.root === '.' ||
          file === workspace.root ||
          file.startsWith(`${workspace.root}/`),
      )
      .sort((a, b) => b.root.length - a.root.length)
    if (candidates[0]) selected.set(candidates[0].manifest, candidates[0])
  }
  for (const workspace of selected.values()) {
    const manifest = path.join(cwd, workspace.manifest)
    let scripts: string[] = []
    let commands: string[] = []
    if (workspace.ecosystem === 'javascript') {
      try {
        const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8')) as {
          scripts?: Record<string, string>
        }
        scripts = ['typecheck', 'test', 'lint', 'build'].filter(
          (script) => parsed.scripts?.[script],
        )
        commands = scripts.map(
          (script) =>
            `${workspace.manager} ${workspace.manager === 'npm' ? 'run ' : 'run '}${script}`,
        )
      } catch {
        /* explicit unknown below */
      }
    } else if (workspace.manager === 'cargo')
      commands = ['cargo check', 'cargo test', 'cargo clippy', 'cargo build']
    else if (workspace.manager === 'go')
      commands = ['go test ./...', 'go vet ./...', 'go build ./...']
    else if (workspace.manager === 'uv')
      commands = ['uv run pytest', 'uv run ruff check .', 'uv build']
    else if (workspace.manager === 'poetry')
      commands = [
        'poetry run pytest',
        'poetry run ruff check .',
        'poetry build',
      ]
    else if (workspace.ecosystem === 'python') commands = ['python -m pytest']
    else if (workspace.manager === 'maven-wrapper')
      commands = ['./mvnw test', './mvnw package']
    else if (workspace.manager === 'maven')
      commands = ['mvn test', 'mvn package']
    else if (workspace.manager === 'gradle-wrapper')
      commands = ['./gradlew test', './gradlew build']
    else if (workspace.manager === 'gradle')
      commands = ['gradle test', 'gradle build']
    else if (workspace.manager === 'dotnet')
      commands = [
        `dotnet test ${path.posix.basename(workspace.manifest)}`,
        `dotnet build ${path.posix.basename(workspace.manifest)}`,
      ]
    else if (workspace.manager === 'swift')
      commands = ['swift test', 'swift build']
    targets.push({
      packageRoot: workspace.root,
      scripts,
      manifest: workspace.manifest,
      manager: workspace.manager,
      commands,
      confidence:
        commands.length === 0
          ? 'unknown'
          : workspace.ecosystem === 'javascript'
            ? workspace.confidence
            : 'inferred',
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
          typeof record.expiresAt !== 'string' ||
          Date.parse(record.expiresAt) > at,
      ) as KnowledgeRecord[]
  }
}

export type WorkspaceLeaseRecord = LocalHarnessRecord & {
  taskId: string
  path: string
  branch?: string
  generation: number
  ownershipToken: string
  acquiredAt: string
  heartbeatAt: string
  expiresAt: string
  status: 'active' | 'released' | 'abandoned'
}

export class WorkspaceLeaseService {
  private readonly now: () => number
  private readonly leaseDurationMs: number

  constructor(
    private readonly store: LocalHarnessStore,
    options: { now?: () => number; leaseDurationMs?: number } = {},
  ) {
    this.now = options.now ?? Date.now
    this.leaseDurationMs = Math.max(1, options.leaseDurationMs ?? 60_000)
  }

  private isExpired(record: WorkspaceLeaseRecord, at: number): boolean {
    const expiresAt = Date.parse(record.expiresAt)
    return !Number.isFinite(expiresAt) || expiresAt <= at
  }

  private abandonExpiredUnlocked(
    repositoryId: string,
    at: number,
  ): WorkspaceLeaseRecord[] {
    const abandoned: WorkspaceLeaseRecord[] = []
    for (const record of this.store.list(
      repositoryId,
      'workspaces',
    ) as WorkspaceLeaseRecord[]) {
      if (record.status !== 'active' || !this.isExpired(record, at)) continue
      const timestamp = new Date(at).toISOString()
      abandoned.push(
        this.store.put(
          'workspaces',
          {
            ...record,
            revision: record.revision + 1,
            updatedAt: timestamp,
            heartbeatAt: timestamp,
            status: 'abandoned',
          },
          record.revision,
        ) as WorkspaceLeaseRecord,
      )
    }
    return abandoned
  }

  acquire(params: {
    repositoryId: string
    workspaceId: string
    runId: string
    snapshotId: string
    taskId: string
    path: string
    branch?: string
  }): WorkspaceLeaseRecord {
    return this.store.withKindLock(params.repositoryId, 'workspaces', () => {
      const now = this.now()
      this.abandonExpiredUnlocked(params.repositoryId, now)
      const records = this.store.list(
        params.repositoryId,
        'workspaces',
      ) as WorkspaceLeaseRecord[]
      const active = records.find(
        (record) =>
          record.status === 'active' &&
          (record.workspaceId === params.workspaceId ||
            record.path === params.path),
      )
      if (active) {
        throw new Error(`Workspace is already leased by run '${active.runId}'.`)
      }

      const id = `workspace-${params.workspaceId}`
      const existing = records.find((record) => record.id === id)
      const timestamp = new Date(now).toISOString()
      const lease: WorkspaceLeaseRecord = {
        schemaVersion: 1,
        id,
        revision: existing ? existing.revision + 1 : 0,
        ...params,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        generation: (existing?.generation ?? 0) + 1,
        ownershipToken: randomUUID(),
        acquiredAt: timestamp,
        heartbeatAt: timestamp,
        expiresAt: new Date(now + this.leaseDurationMs).toISOString(),
        status: 'active',
      }
      return this.store.put(
        'workspaces',
        lease,
        existing?.revision,
      ) as WorkspaceLeaseRecord
    })
  }

  renew(
    repositoryId: string,
    id: string,
    ownershipToken: string,
  ): WorkspaceLeaseRecord {
    return this.store.withKindLock(repositoryId, 'workspaces', () => {
      const existing = this.store.read(repositoryId, 'workspaces', id) as
        | WorkspaceLeaseRecord
        | undefined
      if (!existing) throw new Error('Workspace lease not found.')
      if (existing.ownershipToken !== ownershipToken) {
        throw new Error('Workspace ownership token does not match.')
      }
      if (existing.status !== 'active') {
        throw new Error(
          `Workspace lease is not active (status: ${existing.status}).`,
        )
      }
      const now = this.now()
      if (this.isExpired(existing, now)) {
        throw new Error('Workspace lease has expired and must be reacquired.')
      }
      const timestamp = new Date(now).toISOString()
      return this.store.put(
        'workspaces',
        {
          ...existing,
          revision: existing.revision + 1,
          updatedAt: timestamp,
          heartbeatAt: timestamp,
          expiresAt: new Date(now + this.leaseDurationMs).toISOString(),
        },
        existing.revision,
      ) as WorkspaceLeaseRecord
    })
  }

  heartbeat(
    repositoryId: string,
    id: string,
    ownershipToken: string,
  ): WorkspaceLeaseRecord {
    return this.renew(repositoryId, id, ownershipToken)
  }

  reclaimExpired(repositoryId: string): WorkspaceLeaseRecord[] {
    return this.store.withKindLock(repositoryId, 'workspaces', () =>
      this.abandonExpiredUnlocked(repositoryId, this.now()),
    )
  }

  release(
    repositoryId: string,
    id: string,
    ownershipToken: string,
  ): WorkspaceLeaseRecord {
    return this.store.withKindLock(repositoryId, 'workspaces', () => {
      const existing = this.store.read(repositoryId, 'workspaces', id) as
        | WorkspaceLeaseRecord
        | undefined
      if (!existing) throw new Error('Workspace lease not found.')
      if (existing.ownershipToken !== ownershipToken) {
        throw new Error('Workspace ownership token does not match.')
      }
      if (existing.status !== 'active') {
        throw new Error(
          `Workspace lease is not active (status: ${existing.status}).`,
        )
      }
      const timestamp = new Date(this.now()).toISOString()
      return this.store.put(
        'workspaces',
        {
          ...existing,
          revision: existing.revision + 1,
          updatedAt: timestamp,
          heartbeatAt: timestamp,
          expiresAt: timestamp,
          status: 'released',
        },
        existing.revision,
      ) as WorkspaceLeaseRecord
    })
  }
}

export type ConnectorOperation = 'read' | 'mutation'

export function classifyConnectorOperation(params: {
  connector: string
  operation: string
}): { kind: ConnectorOperation; approvalRequired: boolean } {
  const mutationPattern =
    /create|update|delete|send|post|push|merge|deploy|release|publish|trigger|cancel/i
  const kind: ConnectorOperation = mutationPattern.test(params.operation)
    ? 'mutation'
    : 'read'
  return { kind, approvalRequired: kind === 'mutation' }
}
