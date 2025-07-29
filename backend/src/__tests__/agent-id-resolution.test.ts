import { describe, expect, it, beforeEach } from 'bun:test'
import { AgentRegistry } from '../templates/agent-registry'
import { resolveAgentId } from '@codebuff/common/util/agent-name-normalization'

describe('Agent ID Resolution', () => {
  let mockRegistry: AgentRegistry

  beforeEach(() => {
    mockRegistry = {
      // Built-in agents
      base: {
        id: 'base',
        displayName: 'Buffy',
        systemPrompt: 'Test',
        instructionsPrompt: 'Test',
        stepPrompt: 'Test',
        toolNames: ['end_turn'],
        subagents: [],
        outputMode: 'last_message',
        includeMessageHistory: true,
        model: 'anthropic/claude-4-sonnet-20250522',
        parentPrompt: 'Test',
        inputSchema: {},
      },
      file_picker: {
        id: 'file_picker',
        displayName: 'Fletcher',
        systemPrompt: 'Test',
        instructionsPrompt: 'Test',
        stepPrompt: 'Test',
        toolNames: ['find_files'],
        subagents: [],
        outputMode: 'last_message',
        includeMessageHistory: true,
        model: 'anthropic/claude-4-sonnet-20250522',
        parentPrompt: 'Test',
        inputSchema: {},
      },
      // Spawnable agents with org prefix
      'CodebuffAI/git-committer': {
        id: 'CodebuffAI/git-committer',
        displayName: 'Git Committer',
        systemPrompt: 'Test',
        instructionsPrompt: 'Test',
        stepPrompt: 'Test',
        toolNames: ['end_turn'],
        subagents: [],
        outputMode: 'last_message',
        includeMessageHistory: true,
        model: 'google/gemini-2.5-pro',
        parentPrompt: 'Test',
        inputSchema: {},
      },
      'CodebuffAI/example-agent': {
        id: 'CodebuffAI/example-agent',
        displayName: 'Example Agent',
        systemPrompt: 'Test',
        instructionsPrompt: 'Test',
        stepPrompt: 'Test',
        toolNames: ['end_turn'],
        subagents: [],
        outputMode: 'last_message',
        includeMessageHistory: true,
        model: 'anthropic/claude-4-sonnet-20250522',
        parentPrompt: 'Test',
        inputSchema: {},
      },
      // Custom user agent without prefix
      'my-custom-agent': {
        id: 'my-custom-agent',
        displayName: 'My Custom Agent',
        systemPrompt: 'Test',
        instructionsPrompt: 'Test',
        stepPrompt: 'Test',
        toolNames: ['end_turn'],
        subagents: [],
        outputMode: 'last_message',
        includeMessageHistory: true,
        model: 'anthropic/claude-4-sonnet-20250522',
        parentPrompt: 'Test',
        inputSchema: {},
      },
    }
  })

  describe('Direct ID Resolution', () => {
    it('should resolve built-in agent IDs directly', () => {
      expect(resolveAgentId('base', mockRegistry)).toBe('base')
      expect(resolveAgentId('file_picker', mockRegistry)).toBe('file_picker')
    })

    it('should resolve custom agent IDs directly', () => {
      expect(resolveAgentId('my-custom-agent', mockRegistry)).toBe(
        'my-custom-agent'
      )
    })

    it('should resolve prefixed agent IDs directly', () => {
      expect(resolveAgentId('CodebuffAI/git-committer', mockRegistry)).toBe(
        'CodebuffAI/git-committer'
      )
    })
  })

  describe('Prefixed ID Resolution', () => {
    it('should resolve unprefixed spawnable agent IDs by adding CodebuffAI prefix', () => {
      expect(resolveAgentId('git-committer', mockRegistry)).toBe(
        'CodebuffAI/git-committer'
      )
      expect(resolveAgentId('example-agent', mockRegistry)).toBe(
        'CodebuffAI/example-agent'
      )
    })

    it('should not add prefix to built-in agents', () => {
      // Built-in agents should be found directly, not with prefix
      expect(resolveAgentId('base', mockRegistry)).toBe('base')
      expect(resolveAgentId('file_picker', mockRegistry)).toBe('file_picker')
    })
  })

  describe('Error Cases', () => {
    it('should return null for non-existent agents', () => {
      expect(resolveAgentId('non-existent', mockRegistry)).toBeNull()
      expect(resolveAgentId('CodebuffAI/non-existent', mockRegistry)).toBeNull()
    })

    it('should return null for empty agent ID', () => {
      expect(resolveAgentId('', mockRegistry)).toBeNull()
    })
  })

  describe('Edge Cases', () => {
    it('should handle agent IDs that already have different org prefixes', () => {
      // Add an agent with a different org prefix
      mockRegistry['OtherOrg/special-agent'] = {
        id: 'OtherOrg/special-agent',
        displayName: 'Special Agent',
        systemPrompt: 'Test',
        instructionsPrompt: 'Test',
        stepPrompt: 'Test',
        toolNames: ['end_turn'],
        subagents: [],
        outputMode: 'last_message',
        includeMessageHistory: true,
        model: 'anthropic/claude-4-sonnet-20250522',
        parentPrompt: 'Test',
        inputSchema: {},
      }

      // Should find it directly
      expect(resolveAgentId('OtherOrg/special-agent', mockRegistry)).toBe(
        'OtherOrg/special-agent'
      )

      // Should not add CodebuffAI prefix to it
      expect(resolveAgentId('special-agent', mockRegistry)).toBeNull()
    })

    it('should handle agents with slashes in their names but no org prefix', () => {
      // This is an edge case - an agent ID that contains a slash but isn't an org prefix
      mockRegistry['weird/agent-name'] = {
        id: 'weird/agent-name',
        displayName: 'Weird Agent',
        systemPrompt: 'Test',
        instructionsPrompt: 'Test',
        stepPrompt: 'Test',
        toolNames: ['end_turn'],
        subagents: [],
        outputMode: 'last_message',
        includeMessageHistory: true,
        model: 'anthropic/claude-4-sonnet-20250522',
        parentPrompt: 'Test',
        inputSchema: {},
      }

      expect(resolveAgentId('weird/agent-name', mockRegistry)).toBe(
        'weird/agent-name'
      )
    })
  })
})
