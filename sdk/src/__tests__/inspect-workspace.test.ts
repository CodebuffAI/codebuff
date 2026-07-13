import { describe, expect, test } from 'bun:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { inspectWorkspace } from '../tools/inspect-workspace'

describe('inspectWorkspace', () => {
  test('reports the current repository and worktree without mutation', async () => {
    const result = await inspectWorkspace({ cwd: process.cwd() })
    const value = result[0]?.type === 'json' ? result[0].value : undefined
    expect(value).toBeDefined()
    expect(value).not.toHaveProperty('errorMessage')
    expect(value).toMatchObject({
      workingDirectory: process.cwd(),
    })
    expect(typeof (value as { repositoryRoot?: unknown }).repositoryRoot).toBe(
      'string',
    )
    expect(typeof (value as { headCommit?: unknown }).headCommit).toBe('string')
    expect(typeof (value as { dirty?: unknown }).dirty).toBe('boolean')
    expect(typeof (value as { repositoryId?: unknown }).repositoryId).toBe(
      'string',
    )
    expect(typeof (value as { workspaceId?: unknown }).workspaceId).toBe(
      'string',
    )
  })

  test('shares repository identity across linked worktrees while keeping workspace identity distinct', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-worktree-'))
    const linked = `${root}-linked`
    const git = (...args: string[]) =>
      spawnSync('git', args, { cwd: root, encoding: 'utf8' })
    try {
      expect(git('init').status).toBe(0)
      expect(git('config', 'user.email', 'test@example.com').status).toBe(0)
      expect(git('config', 'user.name', 'Openbuff Test').status).toBe(0)
      fs.writeFileSync(path.join(root, 'file.txt'), 'one\n')
      expect(git('add', '.').status).toBe(0)
      expect(git('commit', '-m', 'initial').status).toBe(0)
      expect(git('worktree', 'add', linked, '-b', 'linked-test').status).toBe(0)
      const main = (await inspectWorkspace({ cwd: root }))[0]!
      const worktree = (await inspectWorkspace({ cwd: linked }))[0]!
      const mainValue = main.type === 'json' ? main.value : undefined
      const linkedValue = worktree.type === 'json' ? worktree.value : undefined
      expect(mainValue).toBeDefined()
      expect(linkedValue).toBeDefined()
      if (!mainValue || !linkedValue)
        throw new Error('Missing workspace result')
      const mainIdentity = mainValue as unknown as {
        repositoryId: string
        workspaceId: string
      }
      const linkedIdentity = linkedValue as unknown as {
        repositoryId: string
        workspaceId: string
      }
      expect(mainIdentity.repositoryId).toBe(linkedIdentity.repositoryId)
      expect(mainIdentity.workspaceId).not.toBe(linkedIdentity.workspaceId)
    } finally {
      spawnSync('git', ['worktree', 'remove', '--force', linked], { cwd: root })
      fs.rmSync(root, { recursive: true, force: true })
      fs.rmSync(linked, { recursive: true, force: true })
    }
  })
})
