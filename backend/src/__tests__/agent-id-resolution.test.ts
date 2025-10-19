import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import {
  DEFAULT_ORG_PREFIX,
  resolveAgentId,
} from '@codebuff/common/util/agent-name-normalization'
import { describe, expect, it, beforeEach } from 'bun:test'

import type { AgentTemplate } from '@codebuff/agent-runtime/templates/types'

describe('Agent ID Resolution', () => {
  let mockRegistry: Record<string, AgentTemplate>
  beforeEach(() => {
    mockRegistry = {
      // Built-in agents
      base: {
        id: 'base',
        displayName: 'Buffy',
        systemPrompt: 'Test',
        instructionsPrompt: 'Test',
        stepPrompt: 'Test',
        mcpServers: {},
        toolNames: ['end_turn'],
        spawnableAgents: [],
        outputMode: 'last_message',
        includeMessageHistory: true,
        inheritParentSystemPrompt: false,
        model: 'anthropic/claude-4-sonnet-20250522',
        spawnerPrompt: 'Test',
        inputSchema: {},
      },
      [AgentTemplateTypes.file_picker]: {
        id: AgentTemplateTypes.file_picker,
        displayName: 'Fletcher',
        systemPrompt: 'Test',
        instructionsPrompt: 'Test',
        stepPrompt: 'Test',
        mcpServers: {},
        toolNames: ['find_files'],
        spawnableAgents: [],
        outputMode: 'last_message',
        includeMessageHistory: true,
        inheritParentSystemPrompt: false,
        model: 'anthropic/claude-4-sonnet-20250522',
        spawnerPrompt: 'Test',
        inputSchema: {},
      },
      // Spawnable agents with org prefix
      [`${DEFAULT_ORG_PREFIX}git-committer`]: {
        id: `${DEFAULT_ORG_PREFIX}git-committer`,
        displayName: 'Git Committer',
        systemPrompt: 'Test',
        instructionsPrompt: 'Test',
        stepPrompt: 'Test',
        mcpServers: {},
        toolNames: ['end_turn'],
        spawnableAgents: [],
        outputMode: 'last_message',
        includeMessageHistory: true,
        inheritParentSystemPrompt: false,
        model: 'google/gemini-2.5-pro',
        spawnerPrompt: 'Test',
        inputSchema: {},
      },
      [`${DEFAULT_ORG_PREFIX}example-agent`]: {
        id: `${DEFAULT_ORG_PREFIX}example-agent`,
        displayName: 'Example Agent',
        systemPrompt: 'Test',
        instructionsPrompt: 'Test',
        stepPrompt: 'Test',
        mcpServers: {},
        toolNames: ['end_turn'],
        spawnableAgents: [],
        outputMode: 'last_message',
        includeMessageHistory: true,
        inheritParentSystemPrompt: false,
        model: 'anthropic/claude-4-sonnet-20250522',
        spawnerPrompt: 'Test',
        inputSchema: {},
      },
      // Custom user agent without prefix
      'my-custom-agent': {
        id: 'my-custom-agent',
        displayName: 'My Custom Agent',
        systemPrompt: 'Test',
        instructionsPrompt: 'Test',
        stepPrompt: 'Test',
        mcpServers: {},
        toolNames: ['end_turn'],
        spawnableAgents: [],
        outputMode: 'last_message',
        includeMessageHistory: true,
        inheritParentSystemPrompt: false,
        model: 'anthropic/claude-4-sonnet-20250522',
        spawnerPrompt: 'Test',
        inputSchema: {},
      },
    }
  })

  describe('Direct ID Resolution', () => {
    it('should resolve built-in agent IDs directly', () => {
      expect(resolveAgentId('base', mockRegistry)).toBe('base')
      expect(resolveAgentId('file-picker', mockRegistry)).toBe('file-picker')
    })

    it('should resolve custom agent IDs directly', () => {
      expect(resolveAgentId('my-custom-agent', mockRegistry)).toBe(
        'my-custom-agent',
      )
    })

    it('should resolve prefixed agent IDs directly', () => {
      expect(
        resolveAgentId(`${DEFAULT_ORG_PREFIX}git-committer`, mockRegistry),
      ).toBe(`${DEFAULT_ORG_PREFIX}git-committer`)
    })
  })

  describe('Prefixed ID Resolution', () => {
    it('should resolve unprefixed spawnable agent IDs by adding the default org prefix', () => {
      expect(resolveAgentId('git-committer', mockRegistry)).toBe(
        `${DEFAULT_ORG_PREFIX}git-committer`,
      )
      expect(resolveAgentId('example-agent', mockRegistry)).toBe(
        `${DEFAULT_ORG_PREFIX}example-agent`,
      )
    })

    it('should not add prefix to built-in agents', () => {
      // Built-in agents should be found directly, not with prefix
      expect(resolveAgentId('base', mockRegistry)).toBe('base')
      expect(resolveAgentId('file-picker', mockRegistry)).toBe('file-picker')
    })
  })

  describe('Error Cases', () => {
    it('should return null for non-existent agents', () => {
      expect(resolveAgentId('non-existent', mockRegistry)).toBeNull()
      expect(
        resolveAgentId(`${DEFAULT_ORG_PREFIX}non-existent`, mockRegistry),
      ).toBeNull()
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
        mcpServers: {},
        toolNames: ['end_turn'],
        spawnableAgents: [],
        outputMode: 'last_message',
        includeMessageHistory: true,
        inheritParentSystemPrompt: false,
        model: 'anthropic/claude-4-sonnet-20250522',
        spawnerPrompt: 'Test',
        inputSchema: {},
      }

      // Should find it directly
      expect(resolveAgentId('OtherOrg/special-agent', mockRegistry)).toBe(
        'OtherOrg/special-agent',
      )

      // Should not add default org prefix to it
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
        mcpServers: {},
        toolNames: ['end_turn'],
        spawnableAgents: [],
        outputMode: 'last_message',
        includeMessageHistory: true,
        inheritParentSystemPrompt: false,
        model: 'anthropic/claude-4-sonnet-20250522',
        spawnerPrompt: 'Test',
        inputSchema: {},
      }

      expect(resolveAgentId('weird/agent-name', mockRegistry)).toBe(
        'weird/agent-name',
      )
    })
  })
})
