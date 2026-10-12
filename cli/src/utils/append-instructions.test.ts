import { expect, test } from 'bun:test'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppendInstructionsError, createAppendInstructionsSnapshot, loadAppendInstructions } from './append-instructions'

test('unset is a no-op; process snapshot caches success and failure across client resets', async () => {
  expect(await loadAppendInstructions()).toBeUndefined()
  let reads = 0
  const snapshot = createAppendInstructionsSnapshot(async () => { reads++; return 'first' })
  expect(await snapshot('/first')).toBe('first')
  expect(await snapshot('/changed')).toBe('first')
  expect(reads).toBe(1)
  const failed = createAppendInstructionsSnapshot(async () => { reads++; throw new AppendInstructionsError() })
  await expect(failed('/bad')).rejects.toBeInstanceOf(AppendInstructionsError)
  await expect(failed('/fixed')).rejects.toBeInstanceOf(AppendInstructionsError)
  expect(reads).toBe(2)
})

test('bounded regular UTF-8 input preserves Unicode; all failures redact path/content', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'freebuff-private-path-'))
  try {
    const file = join(dir, 'private-canary')
    for (const content of ['  你好\n', 'a'.repeat(65536)]) {
      await writeFile(file, content)
      expect(await loadAppendInstructions(file)).toBe(content)
    }
    for (const content of ['', '  ', 'a\0b', Buffer.from([255]), 'a'.repeat(65537)]) {
      await writeFile(file, content)
      try { await loadAppendInstructions(file); throw new Error('accepted invalid input') } catch (error) {
        expect(error).toBeInstanceOf(AppendInstructionsError)
        expect(String(error)).not.toContain(dir)
        expect(String(error)).not.toContain('private-canary')
        expect((error as Error).cause).toBeUndefined()
      }
    }
    await writeFile(file, 'valid')
    const link = join(dir, 'symlink'); await symlink(file, link)
    for (const path of [link, dir, join(dir, 'missing'), 'relative', '']) {
      await expect(loadAppendInstructions(path)).rejects.toBeInstanceOf(AppendInstructionsError)
    }
  } finally { await rm(dir, { recursive: true, force: true }) }
})


test('growth after stat remains bounded and decoder/read failures close the descriptor', async () => {
  for (const scenario of ['growth', 'decode', 'read'] as const) {
    let closed = 0
    const fakeOpen = (async () => ({
      stat: async () => ({ isFile: () => true, size: 1 }),
      read: async (buffer: Buffer, offset: number, length: number) => {
        expect(length).toBeLessThanOrEqual(65537)
        if (scenario === 'read') throw new Error('private path/content must disappear')
        if (offset) return { bytesRead: 0 }
        buffer.fill(scenario === 'decode' ? 255 : 65)
        return { bytesRead: scenario === 'growth' ? 65537 : 1 }
      },
      close: async () => { closed++ },
    })) as unknown as Parameters<typeof loadAppendInstructions>[1]
    await expect(loadAppendInstructions('/private-canary', fakeOpen)).rejects.toBeInstanceOf(AppendInstructionsError)
    expect(closed).toBe(1)
  }
})
