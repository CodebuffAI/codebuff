import { afterEach, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { getChangeReviewBundle } from '../tools/get-change-review-bundle'
import { runTargetedValidation } from '../tools/run-targeted-validation'

describe('runTargetedValidation', () => {
  const temporaryRoots: string[] = []

  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  const createRepository = (): string => {
    const cwd = fs.mkdtempSync(
      path.join(os.tmpdir(), 'openbuff-targeted-validation-'),
    )
    temporaryRoots.push(cwd)
    const git = (...args: string[]) =>
      spawnSync('git', args, { cwd, encoding: 'utf8' })
    expect(git('init').status).toBe(0)
    expect(git('config', 'user.email', 'test@example.com').status).toBe(0)
    expect(git('config', 'user.name', 'Openbuff Test').status).toBe(0)
    fs.writeFileSync(path.join(cwd, 'README.md'), '# Test\n')
    expect(git('add', '.').status).toBe(0)
    expect(git('commit', '-m', 'initial').status).toBe(0)
    return cwd
  }

  test('fails closed for a stale snapshot', async () => {
    const cwd = createRepository()
    const result = await runTargetedValidation({
      cwd,
      snapshotId: 'stale-snapshot',
      files: ['README.md'],
      artifactKinds: ['documentation'],
    })
    expect(result[0]).toMatchObject({
      type: 'json',
      value: { status: 'failed', assurance: 'none' },
    })
  })

  test('returns scoped evidence for the current snapshot', async () => {
    const cwd = createRepository()
    const bundle = await getChangeReviewBundle({ cwd })
    const bundleValue = bundle[0]?.type === 'json' ? bundle[0].value : undefined
    if (!bundleValue || !('snapshotId' in bundleValue)) {
      throw new Error('Expected a change review bundle')
    }
    const result = await runTargetedValidation({
      cwd,
      snapshotId: bundleValue.snapshotId,
      files: ['README.md'],
      artifactKinds: ['documentation'],
    })
    expect(result[0]).toMatchObject({
      type: 'json',
      value: {
        schemaVersion: 1,
        snapshotId: bundleValue.snapshotId,
        files: ['README.md'],
        artifactKinds: ['documentation'],
      },
    })
  })

  test('fails closed when a validation hook returns an execution error', async () => {
    const cwd = createRepository()
    const bundle = await getChangeReviewBundle({ cwd })
    const bundleValue = bundle[0]?.type === 'json' ? bundle[0].value : undefined
    if (!bundleValue || !('snapshotId' in bundleValue)) {
      throw new Error('Expected a change review bundle')
    }

    const result = await runTargetedValidation({
      cwd,
      snapshotId: bundleValue.snapshotId,
      files: ['README.md'],
      runHooks: async () => [
        {
          type: 'json',
          value: [{ errorMessage: 'validator executable was unavailable' }],
        },
      ],
    })

    expect(result[0]).toMatchObject({
      type: 'json',
      value: {
        status: 'failed',
        assurance: 'none',
        summary: 'One or more targeted validation checks failed.',
      },
    })
  })
})
