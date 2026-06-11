import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

let tempDataDir = ''

mock.module('../../project-files', () => ({
  getProjectDataDir: () => tempDataDir,
  getProjectRoot: () => tempDataDir,
  getCurrentChatDir: () => path.join(tempDataDir, 'chats', 'current'),
}))

mock.module('../logger', () => ({
  CHAT_LOG_FILENAME: 'log.jsonl',
  logger: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
  },
}))

import { trimOversizedChatLogs } from '../chat-history'

function writeLog(
  chatId: string,
  sizeBytes: number,
  { ageDays = 0 }: { ageDays?: number } = {},
) {
  const chatDir = path.join(tempDataDir, 'chats', chatId)
  fs.mkdirSync(chatDir, { recursive: true })
  const logFile = path.join(chatDir, 'log.jsonl')
  fs.writeFileSync(logFile, Buffer.alloc(sizeBytes, 'a'))
  if (ageDays > 0) {
    const mtime = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000)
    fs.utimesSync(logFile, mtime, mtime)
  }
  return logFile
}

describe('trimOversizedChatLogs', () => {
  beforeEach(() => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebuff-logs-'))
  })

  afterEach(() => {
    fs.rmSync(tempDataDir, { recursive: true, force: true })
  })

  test('deletes oversized old log files and keeps small ones', () => {
    const bigOldLog = writeLog('chat-big', 11 * 1024 * 1024, { ageDays: 15 })
    const smallOldLog = writeLog('chat-small', 1024, { ageDays: 15 })
    const messagesFile = path.join(
      tempDataDir,
      'chats',
      'chat-big',
      'chat-messages.json',
    )
    fs.writeFileSync(messagesFile, '[]')

    trimOversizedChatLogs()

    expect(fs.existsSync(bigOldLog)).toBe(false)
    expect(fs.existsSync(smallOldLog)).toBe(true)
    // Chat history files are never touched
    expect(fs.existsSync(messagesFile)).toBe(true)
  })

  test('keeps oversized log files from recent chats', () => {
    const bigRecentLog = writeLog('chat-recent', 11 * 1024 * 1024, {
      ageDays: 5,
    })

    trimOversizedChatLogs()

    expect(fs.existsSync(bigRecentLog)).toBe(true)
  })

  test('does nothing when chats directory does not exist', () => {
    expect(() => trimOversizedChatLogs()).not.toThrow()
  })
})
