import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
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
    fs.writeFileSync(path.join(root, 'packages', 'api', 'src', 'user.test.ts'), '')
    expect(
      getAffectedTestTargets(root, ['packages/api/src/user.ts'])[0],
    ).toMatchObject({
      candidates: ['packages/api/src/user.test.ts'],
      packageRoot: 'packages/api',
    })
    expect(getBuildTargets(root, ['packages/api/src/user.ts'])[0]).toMatchObject({
      packageRoot: 'packages/api',
      scripts: ['typecheck', 'test'],
    })
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

  test('external connector mutations require approval', () => {
    expect(
      classifyConnectorOperation({ connector: 'github', operation: 'get_pr' }),
    ).toEqual({ kind: 'read', approvalRequired: false })
    expect(
      classifyConnectorOperation({ connector: 'github', operation: 'merge_pr' }),
    ).toEqual({ kind: 'mutation', approvalRequired: true })
  })
})
