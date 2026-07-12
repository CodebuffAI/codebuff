import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

import { createNodeFileSystem } from '../tools/node-filesystem'

test('default Node filesystem provides bounded text range reads', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'openbuff-range-'))
  const file = path.join(directory, 'large.txt')
  try {
    await writeFile(file, 'one\ntwo\nthree\nfour\n')
    const fs = createNodeFileSystem()
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
