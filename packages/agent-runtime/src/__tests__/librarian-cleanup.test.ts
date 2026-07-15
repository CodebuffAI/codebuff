import fs from 'node:fs'
import path from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { finalizeOwnedLibrarianClone } from '../tools/handlers/tool/spawn-agent-utils'

const created: string[] = []
afterEach(() => {
  for (const directory of created.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

const logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
} as any

describe('Librarian clone cleanup', () => {
  test('deletes only the clone path recorded by the trusted programmatic prompt', async () => {
    const owned = path.join('/tmp', `librarian-repo-${Date.now()}`)
    const unowned = path.join('/tmp', `librarian-repo-${Date.now() + 1}`)
    fs.mkdirSync(owned)
    fs.mkdirSync(unowned)
    created.push(owned, unowned)

    const output = await finalizeOwnedLibrarianClone({
      agentType: 'librarian',
      spawnParams: { repoUrl: 'https://github.com/acme/repo' },
      messageHistory: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `The repository has been cloned to \`${owned}\`. Use it.`,
            },
          ],
        } as any,
      ],
      output: {
        type: 'structuredOutput',
        value: {
          status: 'answered',
          answer: 'Done',
          relevantFiles: [],
          cloneDir: unowned,
          cloneRetained: true,
        },
      },
      logger,
    }) as any

    expect(fs.existsSync(owned)).toBe(false)
    expect(fs.existsSync(unowned)).toBe(true)
    expect(output.value).toMatchObject({
      cloneDir: '',
      cloneRetained: false,
    })
  })

  test('retains the trusted clone only when explicitly requested', async () => {
    const owned = path.join('/tmp', `librarian-repo-${Date.now()}`)
    fs.mkdirSync(owned)
    created.push(owned)

    const output = await finalizeOwnedLibrarianClone({
      agentType: 'librarian',
      spawnParams: {
        repoUrl: 'https://github.com/acme/repo',
        retainClone: true,
      },
      messageHistory: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `The repository has been cloned to \`${owned}\`. Use it.`,
            },
          ],
        } as any,
      ],
      output: {
        type: 'structuredOutput',
        value: { cloneDir: '/tmp/forged', cloneRetained: false },
      },
      logger,
    }) as any

    expect(fs.existsSync(owned)).toBe(true)
    expect(output.value).toMatchObject({
      cloneDir: owned,
      cloneRetained: true,
    })
  })
})
