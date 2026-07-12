import { describe, expect, test } from 'bun:test'

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
  })
})
