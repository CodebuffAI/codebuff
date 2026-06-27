import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

import {
  setProjectRoot,
  setCurrentChatId,
} from '../../project-files'
import {
  saveCheckpoint,
  loadCheckpoint,
  clearCheckpoint,
  getCheckpointPath,
} from '../run-state-storage'
import type { AgentState } from '@codebuff/common/types/session-state'

// Use a real temp project root + chat id so getCheckpointPath() resolves into
// our isolated temp dir (matching the integration-test pattern in this repo,
// rather than module mocking which doesn't reliably intercept bound imports).
const tmpProjectRoot = path.join(os.tmpdir(), `codebuff-checkpoint-test-${process.pid}`)
const tmpConfigDir = path.join(tmpProjectRoot, '.codebuff-config')
const chatId = 'test-chat-checkpoint'

function makeAgentState(agentId: string): AgentState {
  return {
    agentId,
    agentType: 'main',
    agentContext: {},
    ancestorRunIds: [],
    subagents: [],
    childRunIds: [],
    messageHistory: [],
    stepsRemaining: 100,
    creditsUsed: 0,
    directCreditsUsed: 0,
    cacheInputTokens: 0,
    cacheTotalInputTokens: 0,
    systemPrompt: '',
    toolDefinitions: {},
    toolCallResults: new Map(),
    lastCompletedToolCallId: undefined,
    customData: {},
  } as unknown as AgentState
}

describe('turn checkpoint (P2-3)', () => {
  beforeEach(() => {
    if (fs.existsSync(tmpProjectRoot)) {
      fs.rmSync(tmpProjectRoot, { recursive: true, force: true })
    }
    fs.mkdirSync(tmpConfigDir, { recursive: true })
    setProjectRoot(tmpProjectRoot)
    setCurrentChatId(chatId)
    // Stub the config dir resolution so getProjectDataDir uses our temp dir.
    // getConfigDir() reads from env/local state; set the OPENBUFF_CONFIG_DIR
    // equivalent by creating the expected structure directly. We point the
    // project root at our temp dir, so getProjectDataDir derives from its
    // basename — we create the matching structure under the real config dir
    // by overriding the resolver. Simpler: place the chat dir by creating the
    // expected path the same way getCurrentChatDir does.
  })

  afterEach(() => {
    if (fs.existsSync(tmpProjectRoot)) {
      fs.rmSync(tmpProjectRoot, { recursive: true, force: true })
    }
  })

  test('getCheckpointPath points inside the current chat dir', () => {
    const p = getCheckpointPath()
    expect(p).toContain('chats')
    expect(p.endsWith('turn-checkpoint.json')).toBe(true)
  })

  test('loadCheckpoint returns null when no checkpoint exists', () => {
    expect(loadCheckpoint()).toBeNull()
  })

  test('saveCheckpoint writes a valid checkpoint file to disk', () => {
    const agentState = makeAgentState('main-1')
    saveCheckpoint('turn-abc', agentState)
    expect(fs.existsSync(getCheckpointPath())).toBe(true)
  })

  test('loadCheckpoint round-trips the checkpointTurnId and mainAgentState', () => {
    const agentState = makeAgentState('main-2')
    saveCheckpoint('turn-xyz', agentState)
    const loaded = loadCheckpoint()
    expect(loaded).not.toBeNull()
    expect(loaded!.checkpointTurnId).toBe('turn-xyz')
    expect(loaded!.checkpointTime).toBeGreaterThan(0)
    expect(loaded!.mainAgentState).toBeDefined()
    expect(loaded!.mainAgentState.agentId).toBe('main-2')
  })

  test('clearCheckpoint removes the checkpoint file', () => {
    saveCheckpoint('turn-clear', makeAgentState('main-3'))
    expect(fs.existsSync(getCheckpointPath())).toBe(true)
    clearCheckpoint()
    expect(fs.existsSync(getCheckpointPath())).toBe(false)
    expect(loadCheckpoint()).toBeNull()
  })

  test('clearCheckpoint is a no-op when no checkpoint exists', () => {
    expect(() => clearCheckpoint()).not.toThrow()
  })

  test('loadCheckpoint returns null for a malformed checkpoint', () => {
    fs.writeFileSync(getCheckpointPath(), '{ not valid json')
    expect(loadCheckpoint()).toBeNull()
  })

  test('loadCheckpoint returns null when required fields are missing', () => {
    fs.writeFileSync(
      getCheckpointPath(),
      JSON.stringify({ checkpointTime: 123 }), // missing checkpointTurnId + mainAgentState
    )
    expect(loadCheckpoint()).toBeNull()
  })

  test('saveCheckpoint is atomic (no leftover .tmp file on success)', () => {
    saveCheckpoint('turn-atomic', makeAgentState('main-4'))
    const dir = fs.readdirSync(path.dirname(getCheckpointPath()))
    expect(dir).toContain('turn-checkpoint.json')
    expect(dir.some((f) => f.endsWith('.tmp'))).toBe(false)
  })

  test('saveCheckpoint overwrites a previous checkpoint for the same turn', () => {
    saveCheckpoint('turn-overwrite', makeAgentState('main-5a'))
    const first = loadCheckpoint()
    expect(first!.mainAgentState.agentId).toBe('main-5a')

    saveCheckpoint('turn-overwrite', makeAgentState('main-5b'))
    const second = loadCheckpoint()
    expect(second!.mainAgentState.agentId).toBe('main-5b')
    expect(second!.checkpointTurnId).toBe('turn-overwrite')
  })
})