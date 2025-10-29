import { describe, it, expect } from '@jest/globals'

import {
  parseToolCallsFromContent,
  parseSpawnedAgentsFromToolCalls,
  buildTimelineFromMessages,
} from '../trace-processing'

import type { TraceMessage } from '@/app/api/admin/traces/[clientRequestId]/messages/route'

describe('parseToolCallsFromContent', () => {
  it('should parse spawn_agents from XML content', () => {
    const xmlContent = `
      Some text before
      <spawn_agents>
      <agents>[{"agent_type":"file_picker","prompt":"Find auth files"}]</agents>
      </spawn_agents>
      Some text after
    `

    const toolCalls = parseToolCallsFromContent(xmlContent)

    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0].name).toBe('spawn_agents')
    expect(toolCalls[0].input).toEqual({
      agents: [{ agent_type: 'file_picker', prompt: 'Find auth files' }],
    })
  })

  it('should parse multiple spawn_agents calls', () => {
    const xmlContent = `
      <spawn_agents>
      <agents>[{"agent_type":"file_picker","prompt":"Find files"}]</agents>
      </spawn_agents>
      
      <spawn_agents>
      <agents>[{"agent_type":"thinker","prompt":"Think deeply"}]</agents>
      </spawn_agents>
    `

    const toolCalls = parseToolCallsFromContent(xmlContent)

    expect(toolCalls).toHaveLength(2)
    expect(toolCalls[0].input.agents[0].agent_type).toBe('file_picker')
    expect(toolCalls[1].input.agents[0].agent_type).toBe('thinker')
  })

  it('should parse spawn_agents from structured content', () => {
    const structuredContent = [
      {
        type: 'tool_use',
        id: 'test_id',
        name: 'spawn_agents',
        input: {
          agents: [
            {
              agent_type: 'reviewer',
              prompt: 'Review changes',
              params: { focus: 'security' },
            },
          ],
        },
      },
    ]

    const toolCalls = parseToolCallsFromContent(structuredContent)

    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0].name).toBe('spawn_agents')
    expect(toolCalls[0].id).toBe('test_id')
    expect(toolCalls[0].input.agents[0]).toEqual({
      agent_type: 'reviewer',
      prompt: 'Review changes',
      params: { focus: 'security' },
    })
  })
})

describe('parseSpawnedAgentsFromToolCalls', () => {
  it('should extract spawned agents from tool calls', () => {
    const toolCalls = [
      {
        name: 'spawn_agents',
        input: {
          agents: [
            { agent_type: 'file_picker', prompt: 'Find files' },
            { agent_type: 'thinker', prompt: 'Think about it' },
          ],
        },
      },
      {
        name: 'read_files',
        input: { paths: ['file.ts'] },
      },
    ]

    const spawnedAgents = parseSpawnedAgentsFromToolCalls(toolCalls)

    expect(spawnedAgents).toHaveLength(2)
    expect(spawnedAgents[0].agentType).toBe('file_picker')
    expect(spawnedAgents[1].agentType).toBe('thinker')
  })
})

describe('buildTimelineFromMessages', () => {
  it('should create spawned_agent events from spawn_agents tool calls', () => {
    const messages: TraceMessage[] = [
      {
        id: 'msg1',
        client_request_id: 'req1',
        user_id: 'user1',
        model: 'claude-3-sonnet',
        request: {},
        response: `
          I'll spawn some agents to help:
          
          <spawn_agents>
          <agents>[{"agent_type":"file_picker","prompt":"Find relevant files"},{"agent_type":"reviewer","prompt":"Review the changes"}]</agents>
          </spawn_agents>
        `,
        finished_at: new Date('2024-01-01T00:00:10Z'),
        latency_ms: 5000,
        credits: 10,
        input_tokens: 100,
        output_tokens: 200,
        org_id: null,
        repo_url: null,
      },
    ]

    const timeline = buildTimelineFromMessages(messages)

    // Should have 1 agent step + 2 spawned agents
    expect(timeline).toHaveLength(3)

    // First event should be agent step
    expect(timeline[0].type).toBe('agent_step')
    expect(timeline[0].name).toBe('Agent Step 1')

    // Next two should be spawned agents
    const spawnedAgentEvents = timeline.filter(
      (e) => e.type === 'spawned_agent',
    )
    expect(spawnedAgentEvents).toHaveLength(2)
    expect(spawnedAgentEvents[0].name).toBe('file_picker')
    expect(spawnedAgentEvents[1].name).toBe('reviewer')

    // Check metadata
    expect(spawnedAgentEvents[0].metadata.agentType).toBe('file_picker')
    expect(spawnedAgentEvents[0].metadata.result.prompt).toBe(
      'Find relevant files',
    )
    expect(spawnedAgentEvents[1].metadata.agentType).toBe('reviewer')
    expect(spawnedAgentEvents[1].metadata.result.prompt).toBe(
      'Review the changes',
    )

    // Check parent relationship
    expect(spawnedAgentEvents[0].parentId).toBe(timeline[0].id)
    expect(spawnedAgentEvents[1].parentId).toBe(timeline[0].id)
  })

  it('should handle response as nested object structure', () => {
    const messages: TraceMessage[] = [
      {
        id: 'msg1',
        client_request_id: 'req1',
        user_id: 'user1',
        model: 'claude-3-sonnet',
        request: {},
        response: {
          content: `<spawn_agents><agents>[{"agent_type":"planner","prompt":"Create a plan"}]</agents></spawn_agents>`,
        },
        finished_at: new Date('2024-01-01T00:00:10Z'),
        latency_ms: 3000,
        credits: 5,
        input_tokens: 50,
        output_tokens: 100,
        org_id: null,
        repo_url: null,
      },
    ]

    const timeline = buildTimelineFromMessages(messages)

    const spawnedAgentEvent = timeline.find((e) => e.type === 'spawned_agent')
    expect(spawnedAgentEvent).toBeDefined()
    expect(spawnedAgentEvent?.name).toBe('planner')
  })
})
