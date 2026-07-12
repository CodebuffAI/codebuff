import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { getTask } from '../tools/get-task'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('getTask', () => {
  test('projects active plan state and deterministic preflight', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-task-'))
    roots.push(root)
    const sessionDir = path.join(root, '.agents', 'sessions', 'demo')
    fs.mkdirSync(sessionDir, { recursive: true })
    fs.writeFileSync(path.join(root, '.agents', 'ACTIVE_SESSION'), 'demo\n')
    fs.writeFileSync(
      path.join(sessionDir, 'PLAN.md'),
      [
        '# Plan',
        '- [ ] P1-setup Set up the feature',
        '  - Acceptance: feature is configured',
        '  - Validate: bun test',
      ].join('\n'),
    )
    fs.writeFileSync(
      path.join(sessionDir, 'STATE.json'),
      JSON.stringify({
        schemaVersion: 2,
        slug: 'demo',
        status: 'ready',
        currentTask: null,
        revision: 3,
        checkpoint: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    )

    const result = getTask({ cwd: root })
    const value = result[0]?.type === 'json' ? result[0].value : undefined
    expect(value).toMatchObject({
      session: 'demo',
      state: { status: 'ready', revision: 3 },
      preflight: { ok: true, nextTaskId: 'P1-setup' },
      artifacts: ['.agents/sessions/demo/PLAN.md'],
    })
  })

  test('does not accept traversal-shaped session names', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-task-'))
    roots.push(root)
    const result = getTask({ cwd: root, session: '../outside' })
    expect(result).toEqual([
      {
        type: 'json',
        value: { errorMessage: "Invalid plan session slug '../outside'." },
      },
    ])
  })
})
