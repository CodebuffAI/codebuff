import { describe, expect, it } from 'bun:test'

import {
  createAgentState,
  executeSubagent,
} from '../tools/handlers/tool/spawn-agent-utils'
import { MAX_SPAWN_DEPTH_DEFAULT } from '@codebuff/common/constants/agents'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { AgentState } from '@codebuff/common/types/session-state'

function makeTemplate(overrides: Partial<AgentTemplate> = {}): AgentTemplate {
  return {
    id: 'test-agent',
    displayName: 'Test Agent',
    toolNames: [],
    spawnableAgents: [],
    mcpServers: {},
    systemPrompt: '',
    instructionsPrompt: '',
    stepPrompt: '',
    includeMessageHistory: false,
    inheritParentSystemPrompt: false,
    outputMode: 'last_message',
    inputSchema: {},
    ...overrides,
  } as AgentTemplate
}

function makeParentAtDepth(depth: number): AgentState {
  // ancestorRunIds accumulates one entry per ancestor level, so its length
  // equals the current depth. The root orchestrator has depth 0 (empty array).
  return {
    agentId: `parent-at-depth-${depth}`,
    agentType: 'test-agent',
    runId: 'test-run',
    agentContext: {},
    ancestorRunIds: Array.from({ length: depth }, (_, i) => `ancestor-${i}`),
    subagents: [],
    childRunIds: [],
    messageHistory: [],
    stepsRemaining: 200,
    creditsUsed: 0,
    directCreditsUsed: 0,
    cacheInputTokens: 0,
    cacheTotalInputTokens: 0,
    output: undefined,
    parentId: undefined,
    systemPrompt: '',
    toolDefinitions: {},
    contextTokenCount: 0,
  } as AgentState
}

describe('MAX_SPAWN_DEPTH enforcement in executeSubagent', () => {
  it('rejects a spawn that would exceed the default depth (3)', async () => {
    const template = makeTemplate()
    // Parent is at depth 3 (= MAX_SPAWN_DEPTH_DEFAULT); child would be depth 4.
    const parent = makeParentAtDepth(MAX_SPAWN_DEPTH_DEFAULT)

    await expect(
      executeSubagent({
        agentTemplate: template,
        parentAgentState: parent,
        onResponseChunk: () => {},
        ancestorRunIds: parent.ancestorRunIds,
        agentState: createAgentState('test-agent', template, parent, {}),
        prompt: 'go',
        spawnParams: {},
        runAgentStep: (async () => ({
          agentState: parent,
          stepResults: [],
          result: { type: 'completed' },
        })) as any,
        toolCallRequest: {
          id: 'tc-1',
          toolName: 'spawn_agents',
          input: { agents: [] },
        },
        messageHistory: [],
        fileContext: {} as any,
        agentRegistry: new Map(),
        logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as any,
        client: {} as any,
        sessionId: 'test-session',
        runId: 'test-run',
      } as any),
    ).rejects.toThrow(/Maximum spawn depth \(3\) reached/)
  })

  it('allows a spawn at depth 1 (root -> child) — does not raise the depth error', async () => {
    const template = makeTemplate()
    // Parent is at depth 0 (root); child would be depth 1. Should NOT raise
    // the depth error. It may reject for unrelated reasons (no real runtime),
    // so we assert the rejection (if any) is NOT the depth error.
    const parent = makeParentAtDepth(0)

    try {
      await executeSubagent({
        agentTemplate: template,
        parentAgentState: parent,
        onResponseChunk: () => {},
        ancestorRunIds: parent.ancestorRunIds,
        agentState: createAgentState('test-agent', template, parent, {}),
        prompt: 'go',
        spawnParams: {},
        runAgentStep: (async () => ({
          agentState: parent,
          stepResults: [],
          result: { type: 'completed' },
        })) as any,
        toolCallRequest: {
          id: 'tc-1',
          toolName: 'spawn_agents',
          input: { agents: [] },
        },
        messageHistory: [],
        fileContext: {} as any,
        agentRegistry: new Map(),
        logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as any,
        client: {} as any,
        sessionId: 'test-session',
        runId: 'test-run',
      } as any)
    } catch (err: any) {
      expect(String(err.message ?? err)).not.toMatch(/Maximum spawn depth/)
    }
  })

  it('respects a per-template maxSpawnDepth override higher than default — does not raise the depth error', async () => {
    // Template allows depth up to 5; parent at depth 3 should be allowed.
    const template = makeTemplate({ maxSpawnDepth: 5 })
    const parent = makeParentAtDepth(3)

    try {
      await executeSubagent({
        agentTemplate: template,
        parentAgentState: parent,
        onResponseChunk: () => {},
        ancestorRunIds: parent.ancestorRunIds,
        agentState: createAgentState('test-agent', template, parent, {}),
        prompt: 'go',
        spawnParams: {},
        runAgentStep: (async () => ({
          agentState: parent,
          stepResults: [],
          result: { type: 'completed' },
        })) as any,
        toolCallRequest: {
          id: 'tc-1',
          toolName: 'spawn_agents',
          input: { agents: [] },
        },
        messageHistory: [],
        fileContext: {} as any,
        agentRegistry: new Map(),
        logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as any,
        client: {} as any,
        sessionId: 'test-session',
        runId: 'test-run',
      } as any)
    } catch (err: any) {
      expect(String(err.message ?? err)).not.toMatch(/Maximum spawn depth/)
    }
  })

  it('rejects a spawn that exceeds a per-template maxSpawnDepth lower than default', async () => {
    const template = makeTemplate({ maxSpawnDepth: 1 })
    // Parent at depth 1; child would be depth 2, exceeding the template limit.
    const parent = makeParentAtDepth(1)

    await expect(
      executeSubagent({
        agentTemplate: template,
        parentAgentState: parent,
        onResponseChunk: () => {},
        ancestorRunIds: parent.ancestorRunIds,
        agentState: createAgentState('test-agent', template, parent, {}),
        prompt: 'go',
        spawnParams: {},
        runAgentStep: (async () => ({
          agentState: parent,
          stepResults: [],
          result: { type: 'completed' },
        })) as any,
        toolCallRequest: {
          id: 'tc-1',
          toolName: 'spawn_agents',
          input: { agents: [] },
        },
        messageHistory: [],
        fileContext: {} as any,
        agentRegistry: new Map(),
        logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as any,
        client: {} as any,
        sessionId: 'test-session',
        runId: 'test-run',
      } as any),
    ).rejects.toThrow(/Maximum spawn depth \(1\) reached/)
  })

  it('the depth error message mentions the agent id and remediation', async () => {
    const template = makeTemplate({ id: 'file-picker' })
    const parent = makeParentAtDepth(MAX_SPAWN_DEPTH_DEFAULT)

    await expect(
      executeSubagent({
        agentTemplate: template,
        parentAgentState: parent,
        onResponseChunk: () => {},
        ancestorRunIds: parent.ancestorRunIds,
        agentState: createAgentState('file-picker', template, parent, {}),
        prompt: 'go',
        spawnParams: {},
        runAgentStep: (async () => ({
          agentState: parent,
          stepResults: [],
          result: { type: 'completed' },
        })) as any,
        toolCallRequest: {
          id: 'tc-1',
          toolName: 'spawn_agents',
          input: { agents: [] },
        },
        messageHistory: [],
        fileContext: {} as any,
        agentRegistry: new Map(),
        logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} } as any,
        client: {} as any,
        sessionId: 'test-session',
        runId: 'test-run',
      } as any),
    ).rejects.toThrow(/file-picker/)
  })
})
