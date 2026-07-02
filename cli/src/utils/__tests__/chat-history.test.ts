import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

let tempDataDir = ''

mock.module('../../project-files', () => ({
  getProjectDataDir: () => tempDataDir,
}))

mock.module('../logger', () => ({
  logger: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {},
  },
}))

import { deleteChatSession, getAllChats } from '../chat-history'

function writeChat(chatId: string, prompt: string) {
  const chatDir = path.join(tempDataDir, 'chats', chatId)
  fs.mkdirSync(chatDir, { recursive: true })
  fs.writeFileSync(
    path.join(chatDir, 'chat-messages.json'),
    JSON.stringify([
      {
        id: `${chatId}-message`,
        variant: 'user',
        content: prompt,
        timestamp: new Date().toISOString(),
        blocks: [],
      },
    ]),
  )
}

describe('chat-history', () => {
  beforeEach(() => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebuff-history-'))
  })

  afterEach(() => {
    fs.rmSync(tempDataDir, { recursive: true, force: true })
  })

  test('deleteChatSession removes a saved chat directory', () => {
    writeChat('chat-a', 'hello from chat a')
    writeChat('chat-b', 'hello from chat b')

    expect(deleteChatSession('chat-a')).toBe(true)

    expect(fs.existsSync(path.join(tempDataDir, 'chats', 'chat-a'))).toBe(false)
    expect(fs.existsSync(path.join(tempDataDir, 'chats', 'chat-b'))).toBe(true)
    expect(getAllChats().map((chat) => chat.chatId)).toEqual(['chat-b'])
  })

  test('deleteChatSession rejects invalid chat ids', () => {
    const outsideDir = path.join(tempDataDir, 'outside')
    fs.mkdirSync(outsideDir, { recursive: true })

    expect(deleteChatSession('../outside')).toBe(false)
    expect(deleteChatSession('..')).toBe(false)

    expect(fs.existsSync(outsideDir)).toBe(true)
  })

  test('deleteChatSession returns false when the chat does not exist', () => {
    expect(deleteChatSession('missing-chat')).toBe(false)
  })

  test('getAllChats lists corrupt chats as unreadable instead of hiding them', () => {
    writeChat('chat-good', 'hello from a healthy chat')

    // Simulate a chat-messages.json truncated by a crash mid-write
    const corruptDir = path.join(tempDataDir, 'chats', 'chat-corrupt')
    fs.mkdirSync(corruptDir, { recursive: true })
    fs.writeFileSync(
      path.join(corruptDir, 'chat-messages.json'),
      '[{"id":"msg-1","variant":"user","content":"truncat',
    )

    const chats = getAllChats()

    const good = chats.find((chat) => chat.chatId === 'chat-good')
    expect(good).toBeDefined()
    expect(good?.unreadable).toBeUndefined()
    expect(good?.lastPrompt).toBe('hello from a healthy chat')

    const corrupt = chats.find((chat) => chat.chatId === 'chat-corrupt')
    expect(corrupt).toBeDefined()
    expect(corrupt?.unreadable).toBe(true)
    expect(corrupt?.lastPrompt).toBe('(unreadable chat)')
  })

  test('getAllChats lists non-array chat-messages.json as unreadable', () => {
    const badDir = path.join(tempDataDir, 'chats', 'chat-not-array')
    fs.mkdirSync(badDir, { recursive: true })
    fs.writeFileSync(
      path.join(badDir, 'chat-messages.json'),
      '{"not":"an array"}',
    )

    const chats = getAllChats()

    expect(chats).toHaveLength(1)
    expect(chats[0].chatId).toBe('chat-not-array')
    expect(chats[0].unreadable).toBe(true)
  })

  test('getAllChats still hides empty chats', () => {
    const emptyDir = path.join(tempDataDir, 'chats', 'chat-empty')
    fs.mkdirSync(emptyDir, { recursive: true })
    fs.writeFileSync(path.join(emptyDir, 'chat-messages.json'), '[]')

    expect(getAllChats()).toHaveLength(0)
  })
})
