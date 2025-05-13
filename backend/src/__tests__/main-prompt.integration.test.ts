import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'
import { TEST_USER_ID } from 'common/constants'
import { getInitialAgentState } from 'common/types/agent-state'
import { WebSocket } from 'ws'

// Mock imports needed for setup within the test
import * as checkTerminalCommandModule from '../check-terminal-command'
import * as requestFilesPrompt from '../find-files/request-files-prompt'
import * as claude from '../llm-apis/claude'
import * as gemini from '../llm-apis/gemini-api'
import * as openai from '../llm-apis/openai-api'
import { mainPrompt } from '../main-prompt'
import { logger } from '../util/logger'
import * as websocketAction from '../websockets/websocket-action'

// --- Shared Mocks & Helpers ---

class MockWebSocket {
  send(msg: string) {}
  close() {}
  on(event: string, listener: (...args: any[]) => void) {}
  removeListener(event: string, listener: (...args: any[]) => void) {}
}

const mockFileContext = {
  currentWorkingDirectory: '/test',
  fileTree: [],
  fileTokenScores: {},
  knowledgeFiles: {},
  gitChanges: {
    status: '',
    diff: '',
    diffCached: '',
    lastCommitMessages: '',
  },
  changesSinceLastChat: {},
  shellConfigFiles: {},
  systemInfo: {
    platform: 'test',
    shell: 'test',
    nodeVersion: 'test',
    arch: 'test',
    homedir: '/home/test',
    cpus: 1,
  },
  fileVersions: [],
}

// --- Integration Test with Real LLM Call ---
describe('mainPrompt (Integration)', () => {
  afterEach(() => {
    mock.restore()
  })
})
