import { describe, expect, it, mock } from 'bun:test'
import { NoSuchToolError } from 'ai'

import { createToolCallRepairHandler } from '../impl/tool-call-repair'

/**
 * These tests focus on DOMAIN LOGIC - the agent transformation rules,
 * name matching, and JSON parsing. All tests here validate behaviors
 * that could break if the implementation changes.
 */

const createMockLogger = () => ({
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
})

const createNoSuchToolError = (toolName: string) => 
  new NoSuchToolError({ toolName, availableTools: ['spawn_agents'] })

describe('createToolCallRepairHandler', () => {
  describe('agent transformation to spawn_agents', () => {
    it('should transform spawnable agent call to spawn_agents', async () => {
      const handler = createToolCallRepairHandler({
        spawnableAgents: ['codebuff/file-picker@1.0.0'],
        localAgentTemplates: {},
        logger: createMockLogger() as any,
      })

      const result = await handler({
        toolCall: {
          toolName: 'file-picker',
          toolCallId: 'call-123',
          input: JSON.stringify({ prompt: 'Find files' }),
        },
        tools: { spawn_agents: {} },
        error: createNoSuchToolError('file-picker'),
      })

      expect(result.toolName).toBe('spawn_agents')
      const parsed = JSON.parse(result.input)
      expect(parsed.agents[0].agent_type).toBe('codebuff/file-picker@1.0.0')
      expect(parsed.agents[0].prompt).toBe('Find files')
    })

    it('should transform underscore variant (file_picker -> file-picker)', async () => {
      const handler = createToolCallRepairHandler({
        spawnableAgents: ['codebuff/file-picker@1.0.0'],
        localAgentTemplates: {},
        logger: createMockLogger() as any,
      })

      const result = await handler({
        toolCall: {
          toolName: 'file_picker', // underscore
          toolCallId: 'call-123',
          input: JSON.stringify({ prompt: 'Find files' }),
        },
        tools: { spawn_agents: {} },
        error: createNoSuchToolError('file_picker'),
      })

      expect(result.toolName).toBe('spawn_agents')
      const parsed = JSON.parse(result.input)
      expect(parsed.agents[0].agent_type).toBe('codebuff/file-picker@1.0.0')
    })

    it('should transform local agent template calls', async () => {
      const handler = createToolCallRepairHandler({
        spawnableAgents: [],
        localAgentTemplates: { 'my-agent': { id: 'my-agent' } },
        logger: createMockLogger() as any,
      })

      const result = await handler({
        toolCall: {
          toolName: 'my-agent',
          toolCallId: 'call-123',
          input: JSON.stringify({ prompt: 'Do something' }),
        },
        tools: { spawn_agents: {} },
        error: createNoSuchToolError('my-agent'),
      })

      expect(result.toolName).toBe('spawn_agents')
      const parsed = JSON.parse(result.input)
      expect(parsed.agents[0].agent_type).toBe('my-agent')
    })
  })

  describe('params extraction (prompt vs other params)', () => {
    it('should extract prompt separately from other params', async () => {
      const handler = createToolCallRepairHandler({
        spawnableAgents: ['codebuff/commander@1.0.0'],
        localAgentTemplates: {},
        logger: createMockLogger() as any,
      })

      const result = await handler({
        toolCall: {
          toolName: 'commander',
          toolCallId: 'call-123',
          input: JSON.stringify({ 
            prompt: 'Run tests', 
            command: 'npm test',
            timeout: 30 
          }),
        },
        tools: { spawn_agents: {} },
        error: createNoSuchToolError('commander'),
      })

      const parsed = JSON.parse(result.input)
      expect(parsed.agents[0].prompt).toBe('Run tests')
      expect(parsed.agents[0].params.command).toBe('npm test')
      expect(parsed.agents[0].params.timeout).toBe(30)
      // prompt should NOT be in params
      expect(parsed.agents[0].params.prompt).toBeUndefined()
    })

    it('should NOT include params key when only prompt exists', async () => {
      const handler = createToolCallRepairHandler({
        spawnableAgents: ['codebuff/file-picker@1.0.0'],
        localAgentTemplates: {},
        logger: createMockLogger() as any,
      })

      const result = await handler({
        toolCall: {
          toolName: 'file-picker',
          toolCallId: 'call-123',
          input: JSON.stringify({ prompt: 'Find files' }),
        },
        tools: { spawn_agents: {} },
        error: createNoSuchToolError('file-picker'),
      })

      const parsed = JSON.parse(result.input)
      expect(parsed.agents[0].params).toBeUndefined()
    })
  })

  describe('agent name matching', () => {
    it('should match by short name without publisher/version', async () => {
      const handler = createToolCallRepairHandler({
        spawnableAgents: ['some-publisher/my-agent@2.0.0'],
        localAgentTemplates: {},
        logger: createMockLogger() as any,
      })

      const result = await handler({
        toolCall: {
          toolName: 'my-agent', // short name only
          toolCallId: 'call-123',
          input: JSON.stringify({ prompt: 'Do something' }),
        },
        tools: { spawn_agents: {} },
        error: createNoSuchToolError('my-agent'),
      })

      expect(result.toolName).toBe('spawn_agents')
      const parsed = JSON.parse(result.input)
      // Should use FULL agent ID in output
      expect(parsed.agents[0].agent_type).toBe('some-publisher/my-agent@2.0.0')
    })

    it('should match by full agent ID', async () => {
      const handler = createToolCallRepairHandler({
        spawnableAgents: ['codebuff/file-picker@1.0.0'],
        localAgentTemplates: {},
        logger: createMockLogger() as any,
      })

      const result = await handler({
        toolCall: {
          toolName: 'codebuff/file-picker@1.0.0', // full ID
          toolCallId: 'call-123',
          input: JSON.stringify({ prompt: 'Find files' }),
        },
        tools: { spawn_agents: {} },
        error: createNoSuchToolError('codebuff/file-picker@1.0.0'),
      })

      expect(result.toolName).toBe('spawn_agents')
    })
  })

  describe('pass-through behavior (non-transformable calls)', () => {
    it('should pass through when spawn_agents is NOT available', async () => {
      const handler = createToolCallRepairHandler({
        spawnableAgents: ['codebuff/file-picker@1.0.0'],
        localAgentTemplates: {},
        logger: createMockLogger() as any,
      })

      const result = await handler({
        toolCall: {
          toolName: 'file-picker',
          toolCallId: 'call-123',
          input: JSON.stringify({ prompt: 'Find files' }),
        },
        tools: {}, // NO spawn_agents
        error: createNoSuchToolError('file-picker'),
      })

      expect(result.toolName).toBe('file-picker') // unchanged
    })

    it('should pass through when tool is NOT a known agent', async () => {
      const handler = createToolCallRepairHandler({
        spawnableAgents: ['codebuff/file-picker@1.0.0'],
        localAgentTemplates: {},
        logger: createMockLogger() as any,
      })

      const result = await handler({
        toolCall: {
          toolName: 'unknown-tool',
          toolCallId: 'call-123',
          input: JSON.stringify({ foo: 'bar' }),
        },
        tools: { spawn_agents: {} },
        error: createNoSuchToolError('unknown-tool'),
      })

      expect(result.toolName).toBe('unknown-tool') // unchanged
    })

    it('should pass through for non-NoSuchToolError', async () => {
      const handler = createToolCallRepairHandler({
        spawnableAgents: ['codebuff/file-picker@1.0.0'],
        localAgentTemplates: {},
        logger: createMockLogger() as any,
      })

      const result = await handler({
        toolCall: {
          toolName: 'file-picker',
          toolCallId: 'call-123',
          input: JSON.stringify({ prompt: 'Find files' }),
        },
        tools: { spawn_agents: {} },
        error: new Error('Invalid arguments'), // NOT NoSuchToolError
      })

      expect(result.toolName).toBe('file-picker') // unchanged
    })
  })

  describe('JSON input handling', () => {
    it('should handle object input (not string)', async () => {
      const handler = createToolCallRepairHandler({
        spawnableAgents: ['codebuff/file-picker@1.0.0'],
        localAgentTemplates: {},
        logger: createMockLogger() as any,
      })

      const result = await handler({
        toolCall: {
          toolName: 'file-picker',
          toolCallId: 'call-123',
          input: { prompt: 'Find files' }, // Object, not string
        },
        tools: { spawn_agents: {} },
        error: createNoSuchToolError('file-picker'),
      })

      expect(result.toolName).toBe('spawn_agents')
      const parsed = JSON.parse(result.input)
      expect(parsed.agents[0].prompt).toBe('Find files')
    })

    it('should deeply parse nested JSON strings', async () => {
      const handler = createToolCallRepairHandler({
        spawnableAgents: ['codebuff/commander@1.0.0'],
        localAgentTemplates: {},
        logger: createMockLogger() as any,
      })

      const result = await handler({
        toolCall: {
          toolName: 'commander',
          toolCallId: 'call-123',
          input: JSON.stringify({
            prompt: 'Run command',
            params: JSON.stringify({ command: 'echo hello' }), // nested JSON string
          }),
        },
        tools: { spawn_agents: {} },
        error: createNoSuchToolError('commander'),
      })

      const parsed = JSON.parse(result.input)
      // The nested JSON should be deeply parsed
      expect(parsed.agents[0].params.params.command).toBe('echo hello')
    })

    it('should handle malformed JSON gracefully', async () => {
      const handler = createToolCallRepairHandler({
        spawnableAgents: ['codebuff/file-picker@1.0.0'],
        localAgentTemplates: {},
        logger: createMockLogger() as any,
      })

      const result = await handler({
        toolCall: {
          toolName: 'file-picker',
          toolCallId: 'call-123',
          input: 'not valid json',
        },
        tools: { spawn_agents: {} },
        error: createNoSuchToolError('file-picker'),
      })

      // Should still transform, just with empty/undefined prompt
      expect(result.toolName).toBe('spawn_agents')
      const parsed = JSON.parse(result.input)
      expect(parsed.agents[0].agent_type).toBe('codebuff/file-picker@1.0.0')
    })
  })
})
