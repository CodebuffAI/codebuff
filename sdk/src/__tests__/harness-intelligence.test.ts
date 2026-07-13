import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

import { afterEach, describe, expect, test } from 'bun:test'

import {
  VerifiedKnowledgeService,
  WorkspaceLeaseService,
  classifyConnectorOperation,
  createContextPacket,
  getAffectedTestTargets,
  getBuildTargets,
  inspectHarnessEnvironment,
} from '../services/harness-intelligence'
import { LocalHarnessStore } from '../services/local-harness-store'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-intelligence-'))
  roots.push(root)
  return root
}

describe('harness intelligence services', () => {
  test('inspects package manager, manifests, lockfiles, and tools', () => {
    const root = tempRoot()
    fs.writeFileSync(path.join(root, 'package.json'), '{}')
    fs.writeFileSync(path.join(root, 'bun.lock'), '')
    expect(inspectHarnessEnvironment(root)).toMatchObject({
      cwd: root,
      packageManager: 'bun',
      manifests: ['package.json'],
      lockfiles: ['bun.lock'],
      tools: { git: { available: true } },
    })
  })

  test('maps source files to existing tests and package build scripts', () => {
    const root = tempRoot()
    fs.mkdirSync(path.join(root, 'packages', 'api', 'src'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'packages', 'api', 'package.json'),
      JSON.stringify({ scripts: { typecheck: 'tsc', test: 'bun test' } }),
    )
    fs.writeFileSync(
      path.join(root, 'packages', 'api', 'src', 'user.test.ts'),
      '',
    )
    expect(
      getAffectedTestTargets(root, ['packages/api/src/user.ts'])[0],
    ).toMatchObject({
      candidates: ['packages/api/src/user.test.ts'],
      packageRoot: 'packages/api',
    })
    expect(
      getBuildTargets(root, ['packages/api/src/user.ts'])[0],
    ).toMatchObject({
      packageRoot: 'packages/api',
      scripts: ['typecheck', 'test'],
    })
  })

  test('discovers nested multi-language workspaces and manager-specific targets', () => {
    const root = tempRoot()
    fs.mkdirSync(path.join(root, 'apps/web/src'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'apps/web/package.json'),
      JSON.stringify({ scripts: { test: 'vitest', build: 'vite build' } }),
    )
    // Nested JS packages inherit the nearest ancestor manager lockfile.
    fs.writeFileSync(path.join(root, 'pnpm-lock.yaml'), '')
    fs.mkdirSync(path.join(root, 'crates/core/src'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'crates/core/Cargo.toml'),
      '[package]\nname="core"',
    )
    fs.mkdirSync(path.join(root, 'services/api'), { recursive: true })
    fs.writeFileSync(
      path.join(root, 'services/api/pyproject.toml'),
      '[project]\nname="api"',
    )
    fs.writeFileSync(path.join(root, 'services/api/uv.lock'), '')

    const environment = inspectHarnessEnvironment(root)
    expect(environment.manifests).toEqual([
      'apps/web/package.json',
      'crates/core/Cargo.toml',
      'services/api/pyproject.toml',
    ])
    expect(
      environment.workspaces.map(({ root, manager, confidence }) => ({
        root,
        manager,
        confidence,
      })),
    ).toEqual([
      { root: 'apps/web', manager: 'pnpm', confidence: 'confirmed' },
      { root: 'crates/core', manager: 'cargo', confidence: 'confirmed' },
      { root: 'services/api', manager: 'uv', confidence: 'confirmed' },
    ])
    expect(
      getBuildTargets(root, [
        'apps/web/src/app.ts',
        'crates/core/src/lib.rs',
        'services/api/main.py',
      ]),
    ).toEqual([
      expect.objectContaining({
        manager: 'pnpm',
        commands: ['pnpm run test', 'pnpm run build'],
        confidence: 'confirmed',
      }),
      expect.objectContaining({
        manager: 'cargo',
        commands: ['cargo check', 'cargo test', 'cargo clippy', 'cargo build'],
        confidence: 'inferred',
      }),
      expect.objectContaining({
        manager: 'uv',
        commands: ['uv run pytest', 'uv run ruff check .', 'uv build'],
        confidence: 'inferred',
      }),
    ])
  })

  test('marks unparseable workspace targets as unknown instead of guessing', () => {
    const root = tempRoot()
    fs.mkdirSync(path.join(root, 'broken'), { recursive: true })
    fs.writeFileSync(path.join(root, 'broken/package.json'), '{not-json')
    expect(getBuildTargets(root, ['broken/src.ts'])).toEqual([
      expect.objectContaining({
        packageRoot: 'broken',
        manager: 'unknown',
        commands: [],
        confidence: 'unknown',
      }),
    ])
  })

  test('rejects traversal, absolute, and symlink-escaping source paths', () => {
    const root = tempRoot()
    const outside = tempRoot()
    fs.writeFileSync(
      path.join(outside, 'package.json'),
      JSON.stringify({ scripts: { test: 'outside test' } }),
    )
    fs.symlinkSync(outside, path.join(root, 'outside-link'))

    const unsafe = [
      '../package.json',
      path.join(outside, 'source.ts'),
      'outside-link/source.ts',
    ]
    expect(getAffectedTestTargets(root, unsafe)).toEqual([])
    expect(getBuildTargets(root, unsafe)).toEqual([])
  })

  test('context packets are content-addressed', () => {
    const input = {
      objective: 'fix auth',
      acceptanceCriteria: ['sign-in works'],
      items: [
        {
          path: 'src/auth.ts',
          symbols: ['signIn'],
          reason: 'direct implementation',
          confidence: 'confirmed' as const,
        },
      ],
      excluded: ['docs/'],
    }
    expect(createContextPacket(input).id).toBe(createContextPacket(input).id)
  })

  test('knowledge expires and workspace leases enforce ownership', () => {
    const store = new LocalHarnessStore(tempRoot())
    const knowledge = new VerifiedKnowledgeService(store)
    knowledge.record({
      repositoryId: 'repo',
      workspaceId: 'workspace',
      runId: 'run',
      snapshotId: 'snapshot',
      statement: 'Use bun',
      source: 'AGENTS.md',
      sourceHash: 'hash',
      verifiedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    expect(knowledge.listFresh('repo')).toHaveLength(1)

    const leases = new WorkspaceLeaseService(store)
    const lease = leases.acquire({
      repositoryId: 'repo',
      workspaceId: 'workspace',
      runId: 'run',
      snapshotId: 'snapshot',
      taskId: 'task',
      path: '/tmp/workspace',
    })
    expect(() =>
      leases.acquire({
        repositoryId: 'repo',
        workspaceId: 'workspace',
        runId: 'other',
        snapshotId: 'snapshot',
        taskId: 'task-2',
        path: '/tmp/workspace',
      }),
    ).toThrow('already leased')
    expect(leases.release('repo', lease.id, lease.ownershipToken).status).toBe(
      'released',
    )
  })

  test('renews, releases, and reacquires leases with unique generations', () => {
    let now = 1_000
    const leases = new WorkspaceLeaseService(
      new LocalHarnessStore(tempRoot()),
      { now: () => now, leaseDurationMs: 100 },
    )
    const first = leases.acquire({
      repositoryId: 'repo',
      workspaceId: 'workspace',
      runId: 'run-1',
      snapshotId: 'snapshot-1',
      taskId: 'task-1',
      path: '/tmp/workspace',
    })
    expect(first).toMatchObject({ generation: 1, status: 'active' })

    now = 1_050
    const renewed = leases.heartbeat('repo', first.id, first.ownershipToken)
    expect(Date.parse(renewed.expiresAt)).toBe(1_150)
    expect(() => leases.renew('repo', first.id, 'wrong-token')).toThrow(
      'ownership token',
    )
    const released = leases.release('repo', renewed.id, renewed.ownershipToken)
    expect(released.status).toBe('released')

    const second = leases.acquire({
      repositoryId: 'repo',
      workspaceId: 'workspace',
      runId: 'run-2',
      snapshotId: 'snapshot-2',
      taskId: 'task-2',
      path: '/tmp/workspace',
    })
    expect(second.generation).toBe(2)
    expect(second.ownershipToken).not.toBe(first.ownershipToken)
    expect(second.revision).toBe(released.revision + 1)
  })

  test('expires, reclaims, and reacquires abandoned leases', () => {
    let now = 2_000
    const leases = new WorkspaceLeaseService(
      new LocalHarnessStore(tempRoot()),
      { now: () => now, leaseDurationMs: 100 },
    )
    const first = leases.acquire({
      repositoryId: 'repo',
      workspaceId: 'workspace',
      runId: 'run-1',
      snapshotId: 'snapshot-1',
      taskId: 'task-1',
      path: '/tmp/workspace',
    })
    now = 2_101
    expect(() => leases.renew('repo', first.id, first.ownershipToken)).toThrow(
      'expired',
    )
    expect(leases.reclaimExpired('repo')).toMatchObject([
      { id: first.id, generation: 1, status: 'abandoned' },
    ])

    const second = leases.acquire({
      repositoryId: 'repo',
      workspaceId: 'workspace',
      runId: 'run-2',
      snapshotId: 'snapshot-2',
      taskId: 'task-2',
      path: '/tmp/workspace',
    })
    expect(second).toMatchObject({ generation: 2, status: 'active' })
  })

  test('serializes conflicting workspace acquisition across processes', async () => {
    const root = tempRoot()
    const gate = path.join(root, 'gate')
    const servicePath = path.resolve(
      import.meta.dir,
      '..',
      'services',
      'harness-intelligence.ts',
    )
    const storePath = path.resolve(
      import.meta.dir,
      '..',
      'services',
      'local-harness-store.ts',
    )

    const startChild = (name: string) => {
      const ready = path.join(root, `ready-${name}`)
      const code = `
        import fs from 'node:fs';
        import { WorkspaceLeaseService } from ${JSON.stringify(servicePath)};
        import { LocalHarnessStore } from ${JSON.stringify(storePath)};
        const leases = new WorkspaceLeaseService(new LocalHarnessStore(${JSON.stringify(root)}));
        fs.writeFileSync(${JSON.stringify(ready)}, 'ready');
        const wait = new Int32Array(new SharedArrayBuffer(4));
        while (!fs.existsSync(${JSON.stringify(gate)})) Atomics.wait(wait, 0, 0, 5);
        try {
          leases.acquire({
            repositoryId: 'repo',
            workspaceId: ${JSON.stringify(`workspace-${name}`)},
            runId: ${JSON.stringify(`run-${name}`)},
            snapshotId: 'snapshot',
            taskId: ${JSON.stringify(`task-${name}`)},
            path: '/tmp/shared-workspace',
          });
          console.log('ok');
        } catch (error) {
          console.log(error instanceof Error ? error.message : String(error));
        }
      `
      const child = spawn(process.execPath, ['-e', code], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => (stdout += String(chunk)))
      child.stderr.on('data', (chunk) => (stderr += String(chunk)))
      const completed = new Promise<string>((resolve, reject) => {
        child.on('error', reject)
        child.on('close', (exitCode) => {
          if (exitCode === 0) resolve(stdout.trim())
          else reject(new Error(stderr || `child exited ${exitCode}`))
        })
      })
      return { ready, completed }
    }

    const first = startChild('first')
    const second = startChild('second')
    const wait = new Int32Array(new SharedArrayBuffer(4))
    const deadline = Date.now() + 5_000
    while (
      (!fs.existsSync(first.ready) || !fs.existsSync(second.ready)) &&
      Date.now() < deadline
    ) {
      Atomics.wait(wait, 0, 0, 5)
    }
    expect(fs.existsSync(first.ready)).toBe(true)
    expect(fs.existsSync(second.ready)).toBe(true)
    fs.writeFileSync(gate, 'go')

    const outcomes = await Promise.all([first.completed, second.completed])
    expect(outcomes.filter((outcome) => outcome === 'ok')).toHaveLength(1)
    expect(
      outcomes.filter((outcome) => outcome.includes('already leased')),
    ).toHaveLength(1)
  })

  test('external connector mutations require approval', () => {
    expect(
      classifyConnectorOperation({ connector: 'github', operation: 'get_pr' }),
    ).toEqual({ kind: 'read', approvalRequired: false })
    expect(
      classifyConnectorOperation({
        connector: 'github',
        operation: 'merge_pr',
      }),
    ).toEqual({ kind: 'mutation', approvalRequired: true })
  })
})
