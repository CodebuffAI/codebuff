import { describe, expect, test } from 'bun:test'
import z from 'zod/v4'

import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'

import { mockFileContext } from '../../../../__tests__/test-utils'
import { handleSetOutput } from '../set-output'

import type { AgentTemplate } from '../../../../templates/types'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'

describe('handleSetOutput', () => {
  test('returns a recoverable result without setting output for incomplete JSON data', async () => {
    const template: AgentTemplate = {
      id: 'reviewer-test',
      displayName: 'Reviewer Test',
      spawnerPrompt: 'Review code',
      model: 'claude-3-5-sonnet-20241022',
      inputSchema: {},
      outputMode: 'structured_output',
      outputSchema: z.object({ verdict: z.string() }),
      includeMessageHistory: false,
      inheritParentSystemPrompt: false,
      mcpServers: {},
      toolNames: ['set_output'],
      spawnableAgents: [],
      systemPrompt: 'Test system prompt',
      instructionsPrompt: 'Test instructions',
      stepPrompt: 'Test step prompt',
    }
    const agentState = getInitialSessionState(mockFileContext).mainAgentState
    agentState.agentType = template.id
    const toolCall = {
      toolName: 'set_output',
      toolCallId: 'incomplete-review-output',
      input: { data: '{"verdict":"LOOKS_GOOD"' },
    } as unknown as CodebuffToolCall<'set_output'>

    const { output } = await handleSetOutput({
      ...TEST_AGENT_RUNTIME_IMPL,
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      agentState,
      apiKey: 'test-api-key',
      localAgentTemplates: { [template.id]: template },
    } as unknown as Parameters<typeof handleSetOutput>[0])

    expect(agentState.output).toBeUndefined()
    expect(output).toEqual([
      {
        type: 'json',
        value: {
          message: expect.stringContaining('malformed or incomplete JSON text'),
        },
      },
    ])
  })

  test('normalizes individually stringified structured fields before validation', async () => {
    const template: AgentTemplate = {
      id: 'reviewer-normalization-test',
      displayName: 'Reviewer Normalization Test',
      spawnerPrompt: 'Review code',
      model: 'claude-3-5-sonnet-20241022',
      inputSchema: {},
      outputMode: 'structured_output',
      outputSchema: z.object({
        schemaVersion: z.number(),
        verdict: z.enum(['LOOKS_GOOD', 'NON_BLOCKING', 'BLOCKING']),
        snapshotFingerprint: z.string(),
        reviewedFiles: z.array(z.string()),
        findings: z.array(z.string()),
        coverage: z.enum(['covered', 'missing', 'n/a']),
        dimensions: z.object({ correctness: z.string() }),
        requirementCoverage: z.array(
          z.object({
            requirement: z.string(),
            status: z.enum(['satisfied', 'missing', 'uncertain']),
            evidence: z.array(z.string()),
          }),
        ),
      }),
      includeMessageHistory: false,
      inheritParentSystemPrompt: false,
      mcpServers: {},
      toolNames: ['set_output'],
      spawnableAgents: [],
      systemPrompt: 'Test system prompt',
      instructionsPrompt: 'Test instructions',
      stepPrompt: 'Test step prompt',
    }
    const agentState = getInitialSessionState(mockFileContext).mainAgentState
    agentState.agentType = template.id
    const toolCall = {
      toolName: 'set_output',
      toolCallId: 'stringified-review-output',
      input: {
        schemaVersion: '1',
        verdict: 'NON_BLOCKING',
        snapshotFingerprint: 'v3:test',
        reviewedFiles: '["src/a.ts"]',
        findings: '["Minor documentation inconsistency"]',
        coverage: 'n/a',
        dimensions: '{"correctness":"pass"}',
        requirementCoverage:
          '[{"requirement":"Review files","status":"satisfied","evidence":["src/a.ts"]}]',
      },
    } as unknown as CodebuffToolCall<'set_output'>

    const { output } = await handleSetOutput({
      ...TEST_AGENT_RUNTIME_IMPL,
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      agentState,
      apiKey: 'test-api-key',
      localAgentTemplates: { [template.id]: template },
    } as unknown as Parameters<typeof handleSetOutput>[0])

    expect(output).toEqual([{ type: 'json', value: { message: 'Output set' } }])
    expect(agentState.output).toEqual({
      schemaVersion: 1,
      verdict: 'NON_BLOCKING',
      snapshotFingerprint: 'v3:test',
      reviewedFiles: ['src/a.ts'],
      findings: ['Minor documentation inconsistency'],
      coverage: 'n/a',
      dimensions: { correctness: 'pass' },
      requirementCoverage: [
        {
          requirement: 'Review files',
          status: 'satisfied',
          evidence: ['src/a.ts'],
        },
      ],
    })
  })

  test('reports top-level field errors instead of an absent data-field error', async () => {
    const template: AgentTemplate = {
      id: 'reviewer-error-test',
      displayName: 'Reviewer Error Test',
      spawnerPrompt: 'Review code',
      model: 'claude-3-5-sonnet-20241022',
      inputSchema: {},
      outputMode: 'structured_output',
      outputSchema: z.object({ reviewedFiles: z.array(z.string()) }),
      includeMessageHistory: false,
      inheritParentSystemPrompt: false,
      mcpServers: {},
      toolNames: ['set_output'],
      spawnableAgents: [],
      systemPrompt: 'Test system prompt',
      instructionsPrompt: 'Test instructions',
      stepPrompt: 'Test step prompt',
    }
    const agentState = getInitialSessionState(mockFileContext).mainAgentState
    agentState.agentType = template.id
    const toolCall = {
      toolName: 'set_output',
      toolCallId: 'invalid-review-output',
      input: { reviewedFiles: 'not-json' },
    } as unknown as CodebuffToolCall<'set_output'>

    const { output } = await handleSetOutput({
      ...TEST_AGENT_RUNTIME_IMPL,
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      agentState,
      apiKey: 'test-api-key',
      localAgentTemplates: { [template.id]: template },
    } as unknown as Parameters<typeof handleSetOutput>[0])

    const message = output[0]?.type === 'json' ? output[0].value.message : ''
    expect(message).toContain('reviewedFiles')
    expect(message).not.toContain('found inside the `data` field')
    expect(agentState.output).toBeUndefined()
  })

  test('preserves JSON-looking text for fields whose schema expects prose', async () => {
    const template: AgentTemplate = {
      id: 'structured-prose-test',
      displayName: 'Structured Prose Test',
      spawnerPrompt: 'Return prose',
      model: 'claude-3-5-sonnet-20241022',
      inputSchema: {},
      outputMode: 'structured_output',
      outputSchema: z.object({ results: z.string() }),
      includeMessageHistory: false,
      inheritParentSystemPrompt: false,
      mcpServers: {},
      toolNames: ['set_output'],
      spawnableAgents: [],
      systemPrompt: 'Test system prompt',
      instructionsPrompt: 'Test instructions',
      stepPrompt: 'Test step prompt',
    }
    const agentState = getInitialSessionState(mockFileContext).mainAgentState
    agentState.agentType = template.id
    const toolCall = {
      toolName: 'set_output',
      toolCallId: 'json-looking-prose',
      input: { results: '{"example":true}' },
    } as unknown as CodebuffToolCall<'set_output'>

    await handleSetOutput({
      ...TEST_AGENT_RUNTIME_IMPL,
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      agentState,
      apiKey: 'test-api-key',
      localAgentTemplates: { [template.id]: template },
    } as unknown as Parameters<typeof handleSetOutput>[0])

    expect(agentState.output).toEqual({ results: '{"example":true}' })
  })

  test('keeps a valid reviewer schemaVersion string when the schema expects a string', async () => {
    const template: AgentTemplate = {
      id: 'string-version-reviewer',
      displayName: 'String Version Reviewer',
      spawnerPrompt: 'Review code',
      model: 'claude-3-5-sonnet-20241022',
      inputSchema: {},
      outputMode: 'structured_output',
      outputSchema: z.object({ schemaVersion: z.string() }),
      includeMessageHistory: false,
      inheritParentSystemPrompt: false,
      mcpServers: {},
      toolNames: ['set_output'],
      spawnableAgents: [],
      systemPrompt: 'Test system prompt',
      instructionsPrompt: 'Test instructions',
      stepPrompt: 'Test step prompt',
    }
    const agentState = getInitialSessionState(mockFileContext).mainAgentState
    agentState.agentType = template.id
    const toolCall = {
      toolName: 'set_output',
      toolCallId: 'string-schema-version',
      input: { schemaVersion: '1' },
    } as unknown as CodebuffToolCall<'set_output'>

    await handleSetOutput({
      ...TEST_AGENT_RUNTIME_IMPL,
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      agentState,
      apiKey: 'test-api-key',
      localAgentTemplates: { [template.id]: template },
    } as unknown as Parameters<typeof handleSetOutput>[0])

    expect(agentState.output).toEqual({ schemaVersion: '1' })
  })

  test('recovers data-wrapped reviewer-family output for specialist agent ids', async () => {
    const template: AgentTemplate = {
      id: 'evaluator',
      displayName: 'Evaluator',
      spawnerPrompt: 'Evaluate changes',
      model: 'claude-3-5-sonnet-20241022',
      inputSchema: {},
      outputMode: 'structured_output',
      outputSchema: z.object({
        family: z.literal('reviewer'),
        schemaVersion: z.number(),
        reviewedFiles: z.array(z.string()),
        findings: z.array(z.string()),
      }),
      includeMessageHistory: false,
      inheritParentSystemPrompt: false,
      mcpServers: {},
      toolNames: ['set_output'],
      spawnableAgents: [],
      systemPrompt: 'Test system prompt',
      instructionsPrompt: 'Test instructions',
      stepPrompt: 'Test step prompt',
    }
    const agentState = getInitialSessionState(mockFileContext).mainAgentState
    agentState.agentType = template.id
    const toolCall = {
      toolName: 'set_output',
      toolCallId: 'wrapped-specialist-review',
      input: {
        data: {
          family: 'reviewer',
          schemaVersion: '1',
          reviewedFiles: '["src/a.ts"]',
          findings: '[]',
        },
      },
    } as unknown as CodebuffToolCall<'set_output'>

    await handleSetOutput({
      ...TEST_AGENT_RUNTIME_IMPL,
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      agentState,
      apiKey: 'test-api-key',
      localAgentTemplates: { [template.id]: template },
    } as unknown as Parameters<typeof handleSetOutput>[0])

    expect(agentState.output).toEqual({
      family: 'reviewer',
      schemaVersion: 1,
      reviewedFiles: ['src/a.ts'],
      findings: [],
    })
  })
})
