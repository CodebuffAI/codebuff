import { afterEach, describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { getChangeReviewBundle } from '../tools/get-change-review-bundle'
import { LocalHarnessStore } from '../services/local-harness-store'
import {
  advanceWorkspaceState,
  createInitialWorkspaceState,
} from '@codebuff/common/types/workspace-state'

describe('getChangeReviewBundle', () => {
  const temporaryRoots: string[] = []

  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  test('binds status and diff to a deterministic snapshot id', async () => {
    const cwd = fs.mkdtempSync(
      path.join(os.tmpdir(), 'openbuff-review-stable-'),
    )
    temporaryRoots.push(cwd)
    const git = (...args: string[]) =>
      spawnSync('git', args, { cwd, encoding: 'utf8' })
    expect(git('init').status).toBe(0)
    expect(git('config', 'user.email', 'test@example.com').status).toBe(0)
    expect(git('config', 'user.name', 'Openbuff Test').status).toBe(0)
    fs.writeFileSync(path.join(cwd, 'changed.txt'), 'initial\n')
    expect(git('add', '.').status).toBe(0)
    expect(git('commit', '-m', 'initial').status).toBe(0)
    fs.writeFileSync(path.join(cwd, 'changed.txt'), 'changed\n')

    const first = await getChangeReviewBundle({ cwd })
    const second = await getChangeReviewBundle({ cwd })
    const firstValue = first[0]?.type === 'json' ? first[0].value : undefined
    const secondValue = second[0]?.type === 'json' ? second[0].value : undefined
    expect(firstValue).not.toHaveProperty('errorMessage')
    expect(secondValue).not.toHaveProperty('errorMessage')
    expect((firstValue as { snapshotId: string }).snapshotId).toBe(
      (secondValue as { snapshotId: string }).snapshotId,
    )
    expect(Array.isArray((firstValue as { files: unknown }).files)).toBe(true)
    expect(typeof (firstValue as { diff: unknown }).diff).toBe('string')
  })

  test('snapshot identity is independent of display truncation and includes every changed file', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-review-'))
    temporaryRoots.push(cwd)
    const git = (...args: string[]) =>
      spawnSync('git', args, { cwd, encoding: 'utf8' })
    expect(git('init').status).toBe(0)
    expect(git('config', 'user.email', 'test@example.com').status).toBe(0)
    expect(git('config', 'user.name', 'Openbuff Test').status).toBe(0)
    fs.writeFileSync(path.join(cwd, 'first.txt'), 'first\n')
    fs.writeFileSync(path.join(cwd, 'second.txt'), 'second\n')
    expect(git('add', '.').status).toBe(0)
    expect(git('commit', '-m', 'initial').status).toBe(0)
    fs.writeFileSync(path.join(cwd, 'first.txt'), `${'x'.repeat(4_000)}\n`)
    fs.writeFileSync(path.join(cwd, 'second.txt'), 'changed\n')

    const small = await getChangeReviewBundle({ cwd, max_chars: 500 })
    const large = await getChangeReviewBundle({ cwd, max_chars: 20_000 })
    const smallValue = (small[0]!.type === 'json' ? small[0]!.value : {}) as {
      snapshotId: string
      files: string[]
    }
    const largeValue = (large[0]!.type === 'json' ? large[0]!.value : {}) as {
      snapshotId: string
    }
    expect(smallValue.snapshotId).toBe(largeValue.snapshotId)
    expect(smallValue.files).toEqual(['first.txt', 'second.txt'])

    const before = smallValue.snapshotId
    fs.writeFileSync(path.join(cwd, 'second.txt'), 'CHANGED\n')
    const after = await getChangeReviewBundle({ cwd, max_chars: 500 })
    const afterValue = (after[0]!.type === 'json' ? after[0]!.value : {}) as {
      snapshotId: string
    }
    expect(afterValue.snapshotId).not.toBe(before)
  })

  test('binds review snapshots to the monotonic workspace revision', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-review-rev-'))
    temporaryRoots.push(cwd)
    const git = (...args: string[]) =>
      spawnSync('git', args, { cwd, encoding: 'utf8' })
    expect(git('init').status).toBe(0)
    expect(git('config', 'user.email', 'test@example.com').status).toBe(0)
    expect(git('config', 'user.name', 'Openbuff Test').status).toBe(0)
    fs.writeFileSync(path.join(cwd, 'changed.txt'), 'initial\n')
    expect(git('add', '.').status).toBe(0)
    expect(git('commit', '-m', 'initial').status).toBe(0)
    fs.writeFileSync(path.join(cwd, 'changed.txt'), 'changed\n')
    const initialWorkspace = createInitialWorkspaceState()
    const advancedWorkspace = advanceWorkspaceState(initialWorkspace, {
      source: 'test',
      actions: [
        {
          action: 'update',
          path: 'changed.txt',
          beforeHash: 'before',
          afterHash: 'after',
        },
      ],
    })

    const first = await getChangeReviewBundle({
      cwd,
      workspaceState: initialWorkspace,
    })
    const second = await getChangeReviewBundle({
      cwd,
      workspaceState: advancedWorkspace,
    })
    const firstValue = first[0]?.type === 'json' ? first[0].value : undefined
    const secondValue = second[0]?.type === 'json' ? second[0].value : undefined
    expect(firstValue).not.toHaveProperty('errorMessage')
    expect(secondValue).not.toHaveProperty('errorMessage')
    expect((firstValue as { snapshotId: string }).snapshotId).not.toBe(
      (secondValue as { snapshotId: string }).snapshotId,
    )
    expect(secondValue).toMatchObject({
      workspaceRevision: advancedWorkspace.revision,
      workspaceSnapshotId: advancedWorkspace.snapshotId,
    })
  })

  test('returns only records bound to the current repository, workspace, snapshot, and changed files', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-review-state-'))
    const stateDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'openbuff-harness-state-'),
    )
    temporaryRoots.push(cwd, stateDir)
    const git = (...args: string[]) =>
      spawnSync('git', args, { cwd, encoding: 'utf8' })
    expect(git('init').status).toBe(0)
    expect(git('config', 'user.email', 'test@example.com').status).toBe(0)
    expect(git('config', 'user.name', 'Openbuff Test').status).toBe(0)
    fs.writeFileSync(path.join(cwd, 'first.txt'), 'first\n')
    fs.writeFileSync(path.join(cwd, 'other.txt'), 'other\n')
    expect(git('add', '.').status).toBe(0)
    expect(git('commit', '-m', 'initial').status).toBe(0)
    fs.writeFileSync(path.join(cwd, 'first.txt'), 'changed\n')
    const initial = await getChangeReviewBundle({ cwd, stateDir })
    const value =
      initial[0]!.type === 'json'
        ? (initial[0]!.value as unknown as {
            snapshotId: string
            repositoryId: string
            workspaceId: string
          })
        : undefined
    expect(value).toBeDefined()
    const now = new Date().toISOString()
    const base = {
      schemaVersion: 1 as const,
      revision: 0,
      repositoryId: value!.repositoryId,
      workspaceId: value!.workspaceId,
      runId: 'run',
      snapshotId: value!.snapshotId,
      createdAt: now,
      updatedAt: now,
    }
    const store = new LocalHarnessStore(stateDir)
    store.put('ownership', {
      ...base,
      id: 'owned',
      transactionId: 'tx',
      agentRole: 'editor',
      findingsAddressed: [],
      requirementsAddressed: [],
      changes: [{ path: 'first.txt', ownership: 'agent' }],
    })
    store.put('ownership', {
      ...base,
      id: 'unrelated',
      transactionId: 'tx2',
      agentRole: 'editor',
      findingsAddressed: [],
      requirementsAddressed: [],
      changes: [{ path: 'other.txt', ownership: 'agent' }],
    })
    store.put('validation', {
      ...base,
      id: 'valid',
      command: 'test',
      files: ['first.txt'],
      artifactKinds: [],
      status: 'passed',
      assurance: 'full',
      diagnostics: [],
    })
    store.put('findings', {
      ...base,
      id: 'open',
      reviewerId: 'reviewer',
      severity: 'high',
      text: 'issue',
      files: ['first.txt'],
      status: 'open',
    })
    store.put('findings', {
      ...base,
      id: 'resolved',
      reviewerId: 'reviewer',
      severity: 'low',
      text: 'old',
      files: ['first.txt'],
      status: 'resolved',
    })
    store.put('findings', {
      ...base,
      id: 'stale',
      snapshotId: 'old-snapshot',
      reviewerId: 'reviewer',
      severity: 'high',
      text: 'stale',
      files: ['first.txt'],
      status: 'open',
    })
    const result = await getChangeReviewBundle({ cwd, stateDir })
    const reviewed =
      result[0]!.type === 'json'
        ? (result[0]!.value as unknown as {
            ownership: Array<{ id: string }>
            validation: Array<{ id: string }>
            findings: Array<{ id: string }>
          })
        : undefined
    expect(reviewed!.ownership.map((record) => record.id)).toEqual(['owned'])
    expect(reviewed!.validation.map((record) => record.id)).toEqual(['valid'])
    expect(reviewed!.findings.map((record) => record.id)).toEqual(['open'])
  })

  test('falls back to the last commit diff when the worktree is clean', async () => {
    const cwd = fs.mkdtempSync(
      path.join(os.tmpdir(), 'openbuff-review-committed-'),
    )
    temporaryRoots.push(cwd)
    const git = (...args: string[]) =>
      spawnSync('git', args, { cwd, encoding: 'utf8' })
    expect(git('init').status).toBe(0)
    expect(git('config', 'user.email', 'test@example.com').status).toBe(0)
    expect(git('config', 'user.name', 'Openbuff Test').status).toBe(0)
    fs.writeFileSync(path.join(cwd, 'file.txt'), 'initial\n')
    expect(git('add', '.').status).toBe(0)
    expect(git('commit', '-m', 'initial').status).toBe(0)
    fs.writeFileSync(path.join(cwd, 'file.txt'), 'changed\n')
    expect(git('add', '.').status).toBe(0)
    expect(git('commit', '-m', 'second').status).toBe(0)

    const result = await getChangeReviewBundle({ cwd })
    const value = result[0]?.type === 'json' ? result[0].value : undefined
    expect(value).not.toHaveProperty('errorMessage')
    const bundle = value as { files: string[]; diff: string }
    expect(bundle.files).toEqual(['file.txt'])
    expect(bundle.diff.length).toBeGreaterThan(0)
  })

  test('returns empty files when the worktree is clean and there is no parent commit', async () => {
    const cwd = fs.mkdtempSync(
      path.join(os.tmpdir(), 'openbuff-review-single-'),
    )
    temporaryRoots.push(cwd)
    const git = (...args: string[]) =>
      spawnSync('git', args, { cwd, encoding: 'utf8' })
    expect(git('init').status).toBe(0)
    expect(git('config', 'user.email', 'test@example.com').status).toBe(0)
    expect(git('config', 'user.name', 'Openbuff Test').status).toBe(0)
    fs.writeFileSync(path.join(cwd, 'file.txt'), 'initial\n')
    expect(git('add', '.').status).toBe(0)
    expect(git('commit', '-m', 'initial').status).toBe(0)

    const result = await getChangeReviewBundle({ cwd })
    const value = result[0]?.type === 'json' ? result[0].value : undefined
    expect(value).not.toHaveProperty('errorMessage')
    const bundle = value as { files: string[]; diff: string }
    expect(bundle.files).toEqual([])
    expect(bundle.diff).toBe('')
  })
})
