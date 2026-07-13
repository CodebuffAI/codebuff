import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  appendMessageHistory,
  getMessageHistoryJournalPath,
  getMessageHistoryPath,
  loadMessageHistory,
} from '../message-history'

describe('message history compaction', () => {
  let tempDir: string
  let originalConfigDir: string | undefined

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-history-'))
    originalConfigDir = process.env.OPENBUFF_CONFIG_DIR
    process.env.OPENBUFF_CONFIG_DIR = tempDir
  })

  afterEach(() => {
    if (originalConfigDir === undefined) delete process.env.OPENBUFF_CONFIG_DIR
    else process.env.OPENBUFF_CONFIG_DIR = originalConfigDir
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  test('compacts an oversized journal into a bounded snapshot', () => {
    const entries = Array.from(
      { length: 1100 },
      (_, index) => `${index}:${'x'.repeat(300)}`,
    )
    fs.writeFileSync(
      getMessageHistoryJournalPath(),
      entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n',
    )

    appendMessageHistory('latest')

    const loaded = loadMessageHistory()
    expect(loaded).toHaveLength(1000)
    expect(loaded.at(-1)).toBe('latest')
    expect(JSON.parse(fs.readFileSync(getMessageHistoryPath(), 'utf8'))).toHaveLength(
      1000,
    )
    expect(fs.readFileSync(getMessageHistoryJournalPath(), 'utf8')).toBe('')
  })

  test('recovers a stale lock left by a crashed process', () => {
    const lockPath = path.join(tempDir, 'message-history.lock')
    fs.writeFileSync(lockPath, '')
    const staleTime = new Date(Date.now() - 60_000)
    fs.utimesSync(lockPath, staleTime, staleTime)

    appendMessageHistory('after-crash')

    expect(loadMessageHistory()).toEqual(['after-crash'])
    expect(fs.existsSync(lockPath)).toBe(false)
  })
})
