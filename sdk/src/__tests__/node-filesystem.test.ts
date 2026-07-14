import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

import { createNodeFileSystem } from '../tools/node-filesystem'
import { changeFile } from '../tools/change-file'
import { WorkspaceMutationBroker } from '../services/workspace-mutation-broker'
import { detectFilesystemCapabilities } from '../tools/filesystem-authority'

test('default Node filesystem provides bounded text range reads', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'openbuff-range-'))
  const file = path.join(directory, 'large.txt')
  try {
    await writeFile(file, 'one\ntwo\nthree\nfour\n')
    const fs = createNodeFileSystem()
    expect(fs.conditionalCommit).toBeUndefined()
    expect(fs.conditionalDelete).toBeUndefined()
    expect(fs.conditionalMove).toBeUndefined()
    const result = await fs.readTextRange!(file, 2, 3, 1024)
    expect(Buffer.from(result.data).toString('utf8')).toBe('two\nthree\n')
    expect(result).toMatchObject({
      startLine: 2,
      endLine: 3,
      totalLines: 4,
      complete: true,
    })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('default Node filesystem fails closed instead of emulating conditional commit', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'openbuff-cas-'))
  const file = path.join(directory, 'file.txt')
  try {
    await writeFile(file, 'before\n')
    const fs = createNodeFileSystem()
    const result = await changeFile({
      parameters: {
        type: 'file',
        path: 'file.txt',
        content: 'after\n',
      },
      cwd: directory,
      fs,
    })
    expect(result[0]?.type === 'json' ? result[0].value : null).toMatchObject({
      outcome: 'not_applied',
      errors: [expect.objectContaining({ code: 'unsupported' })],
    })
    expect(await fs.readFile(file, 'utf8')).toBe('before\n')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('broker-backed Node filesystem exposes cooperative conditional mutations', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'openbuff-broker-fs-'))
  const stateDir = path.join(directory, 'state')
  const workspace = path.join(directory, 'workspace')
  const file = path.join(workspace, 'file.txt')
  try {
    await mkdir(workspace, { recursive: true })
    await writeFile(file, 'before\n')
    const broker = await WorkspaceMutationBroker.create({
      cwd: workspace,
      stateDir,
    })
    const fs = createNodeFileSystem({ mutationBroker: broker })
    expect(fs.conditionalCommit).toBeFunction()
    expect(fs.conditionalDelete).toBeFunction()
    expect(fs.conditionalMove).toBeFunction()
    expect(detectFilesystemCapabilities(fs).tier).toBe('cooperative')

    const result = await changeFile({
      parameters: {
        type: 'file',
        path: 'file.txt',
        content: 'after\n',
      },
      cwd: workspace,
      fs,
    })
    expect(result[0]?.type === 'json' ? result[0].value : null).toMatchObject({
      outcome: 'applied',
      authorityTier: 'conditional_commit',
    })
    expect(await fs.readFile(file, 'utf8')).toBe('after\n')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
