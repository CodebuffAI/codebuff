import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'

import * as auth from '../auth'
import {
  appendMessageHistory,
  getMessageHistoryPath,
  loadMessageHistory,
  saveMessageHistory,
} from '../message-history'

let tempConfigDir = ''
let getConfigDirSpy: ReturnType<typeof spyOn> | undefined
let originalHistorySize: string | undefined
let originalHistoryScope: string | undefined

beforeEach(() => {
  tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freebuff-history-'))
  getConfigDirSpy = spyOn(auth, 'getConfigDir').mockReturnValue(tempConfigDir)
  originalHistorySize = process.env.FREEBUFF_HISTORY_SIZE
  originalHistoryScope = process.env.FREEBUFF_HISTORY_SCOPE
  delete process.env.FREEBUFF_HISTORY_SIZE
  delete process.env.FREEBUFF_HISTORY_SCOPE
})

afterEach(() => {
  getConfigDirSpy?.mockRestore()
  getConfigDirSpy = undefined

  if (originalHistorySize === undefined) {
    delete process.env.FREEBUFF_HISTORY_SIZE
  } else {
    process.env.FREEBUFF_HISTORY_SIZE = originalHistorySize
  }

  if (originalHistoryScope === undefined) {
    delete process.env.FREEBUFF_HISTORY_SCOPE
  } else {
    process.env.FREEBUFF_HISTORY_SCOPE = originalHistoryScope
  }

  fs.rmSync(tempConfigDir, { recursive: true, force: true })
})

describe('message history persistence', () => {
  test('scopes history to the current project by default', () => {
    const projectA = path.join(os.tmpdir(), 'freebuff-project-a')
    const projectB = path.join(os.tmpdir(), 'freebuff-project-b')

    saveMessageHistory(['from a'], projectA)
    saveMessageHistory(['from b'], projectB)

    expect(loadMessageHistory(projectA)).toEqual(['from a'])
    expect(loadMessageHistory(projectB)).toEqual(['from b'])
    expect(getMessageHistoryPath(projectA)).not.toBe(
      getMessageHistoryPath(projectB),
    )
  })

  test('can opt back into global history scope', () => {
    process.env.FREEBUFF_HISTORY_SCOPE = 'global'

    saveMessageHistory(['shared'], '/repo/one')

    expect(loadMessageHistory('/repo/two')).toEqual(['shared'])
    expect(getMessageHistoryPath('/repo/one')).toBe(
      getMessageHistoryPath('/repo/two'),
    )
  })

  test('appendMessageHistory collapses consecutive duplicates', () => {
    saveMessageHistory(['first', 'repeat'])

    expect(appendMessageHistory('repeat')).toEqual(['first', 'repeat'])
    expect(loadMessageHistory()).toEqual(['first', 'repeat'])

    expect(appendMessageHistory('next')).toEqual(['first', 'repeat', 'next'])
    expect(loadMessageHistory()).toEqual(['first', 'repeat', 'next'])
  })

  test('FREEBUFF_HISTORY_SIZE limits persisted entries', () => {
    process.env.FREEBUFF_HISTORY_SIZE = '2'

    saveMessageHistory(['one', 'two', 'three'])

    expect(loadMessageHistory()).toEqual(['two', 'three'])
  })

  test('default history size is capped at 500 entries', () => {
    const history = Array.from({ length: 501 }, (_, index) => `entry-${index}`)

    saveMessageHistory(history)

    const savedHistory = loadMessageHistory()
    expect(savedHistory).toHaveLength(500)
    expect(savedHistory[0]).toBe('entry-1')
    expect(savedHistory.at(-1)).toBe('entry-500')
  })

  test('FREEBUFF_HISTORY_SIZE=0 disables reads and writes without deleting existing history', () => {
    saveMessageHistory(['before'])
    const historyPath = getMessageHistoryPath()
    process.env.FREEBUFF_HISTORY_SIZE = '0'

    expect(loadMessageHistory()).toEqual([])
    expect(appendMessageHistory('after')).toEqual([])
    expect(JSON.parse(fs.readFileSync(historyPath, 'utf8'))).toEqual(['before'])
  })
})
