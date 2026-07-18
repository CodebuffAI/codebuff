import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import {
  ChangeOwnershipService,
  HarnessApprovalService,
  classifyTerminalHarnessAction,
  evaluateHarnessActionPolicy,
} from '../services/harness-enforcement'
import { LocalHarnessStore } from '../services/local-harness-store'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-enforcement-'))
  roots.push(root)
  return new LocalHarnessStore(root)
}

const scope = {
  repositoryId: 'repo-1',
  workspaceId: 'workspace-1',
  runId: 'run-1',
  snapshotId: 'snapshot-1',
}

describe('harness enforcement services', () => {
  test('approvals are exact-scope and single-use', () => {
    const service = new HarnessApprovalService(setup())
    const grant = service.grant(scope, {
      action: 'push',
      target: 'origin/feature',
    })
    expect(() =>
      service.consume({
        repositoryId: 'repo-1',
        workspaceId: 'workspace-1',
        runId: 'run-1',
        approvalId: grant.id,
        action: 'push',
        target: 'origin/other',
        snapshotId: 'snapshot-1',
      }),
    ).toThrow('scope does not match')
    expect(
      service.consume({
        repositoryId: 'repo-1',
        workspaceId: 'workspace-1',
        runId: 'run-1',
        approvalId: grant.id,
        action: 'push',
        target: 'origin/feature',
        snapshotId: 'snapshot-1',
      }).consumedAt,
    ).toBeDefined()
    expect(() =>
      service.consume({
        repositoryId: 'repo-1',
        workspaceId: 'workspace-1',
        runId: 'run-1',
        approvalId: grant.id,
        action: 'push',
        target: 'origin/feature',
        snapshotId: 'snapshot-1',
      }),
    ).toThrow('already consumed')
  })

  test('ownership receipts reject traversal and duplicate paths', () => {
    const service = new ChangeOwnershipService(setup())
    expect(() =>
      service.record(scope, {
        transactionId: 'tx-1',
        agentRole: 'editor',
        findingsAddressed: [],
        requirementsAddressed: [],
        changes: [{ path: '../secret', ownership: 'agent' }],
      }),
    ).toThrow('Invalid ownership path')
  })

  test('policy supports balanced, strict, and allow-all approval modes', () => {
    expect(
      evaluateHarnessActionPolicy({
        action: 'release',
        target: 'v1.0.0',
        hasMatchingApproval: false,
      }),
    ).toMatchObject({ allowed: false, approvalRequired: true })
    expect(
      evaluateHarnessActionPolicy({
        action: 'dependency-install',
        target: 'bun install',
        hasMatchingApproval: false,
      }),
    ).toEqual({ allowed: true, approvalRequired: false })
    expect(
      evaluateHarnessActionPolicy({
        action: 'dependency-install',
        target: 'bun install',
        hasMatchingApproval: false,
        approvalMode: 'strict',
      }),
    ).toMatchObject({ allowed: false, approvalRequired: true })
    expect(
      evaluateHarnessActionPolicy({
        action: 'deploy',
        target: 'kubectl apply -f deploy.yaml',
        hasMatchingApproval: false,
        approvalMode: 'allow-all',
      }),
    ).toEqual({ allowed: true, approvalRequired: false })
    expect(
      evaluateHarnessActionPolicy({
        action: 'push',
        target: 'origin/main',
        branch: 'main',
        defaultBranch: 'main',
        hasMatchingApproval: false,
      }),
    ).toMatchObject({ allowed: false, approvalRequired: true })
  })

  test('classifies only recognized high-impact command shapes', () => {
    expect(
      classifyTerminalHarnessAction('git push -u origin feature/x'),
    ).toEqual({
      action: 'push',
      target: 'origin/feature/x',
      branch: 'feature/x',
    })
    expect(classifyTerminalHarnessAction('git push')).toEqual({
      action: 'push',
      target: 'git push',
    })
    expect(classifyTerminalHarnessAction('git push origin HEAD:main')).toEqual({
      action: 'push',
      target: 'origin/main',
      branch: 'main',
    })
    expect(
      classifyTerminalHarnessAction('git push --force origin main'),
    ).toEqual({
      action: 'push',
      target: 'git push --force origin main',
      branch: 'main',
    })
    expect(classifyTerminalHarnessAction('pnpm add zod')).toMatchObject({
      action: 'dependency-install',
    })
    expect(classifyTerminalHarnessAction('git commit -m test')).toMatchObject({
      action: 'commit',
    })
    expect(classifyTerminalHarnessAction('find src -delete')).toMatchObject({
      action: 'workspace-delete',
    })
    expect(classifyTerminalHarnessAction('node -e "fetch(url)"')).toMatchObject(
      {
        action: 'arbitrary-code',
      },
    )
    expect(classifyTerminalHarnessAction('bun test')).toBeUndefined()
  })
})
