import { openrouterModels } from '@codebuff/common/constants'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { describe, expect, it } from 'bun:test'
import { processAgentOverrides } from '../agent-overrides'
import { AgentTemplate } from '../types'

describe('processAgentOverrides', () => {
  const mockBaseTemplate: AgentTemplate = {
    id: AgentTemplateTypes.reviewer,
    name: 'Test Reviewer',
    purpose: 'Test description',
    model: openrouterModels.openrouter_claude_3_5_sonnet,
    promptSchema: { prompt: undefined },
    outputMode: 'last_message',
    includeMessageHistory: true,
    toolNames: ['end_turn'],
    spawnableAgents: [],
    initialAssistantMessage: '',
    initialAssistantPrefix: '',
    stepAssistantMessage: '',
    stepAssistantPrefix: '',
    systemPrompt: 'Base system prompt',
    userInputPrompt: 'Base user input prompt',
    agentStepPrompt: 'Base agent step prompt',
  }

  const mockFileContext: ProjectFileContext = {
    projectRoot: '/test',
    cwd: '/test',
    fileTree: [],
    fileTokenScores: {},
    tokenCallers: {},
    knowledgeFiles: {},
    agentTemplates: {},
    shellConfigFiles: {},
    systemInfo: {
      platform: 'darwin',
      shell: 'bash',
      nodeVersion: 'v20.0.0',
      arch: 'arm64',
      homedir: '/Users/test',
      cpus: 8,
    },
    userKnowledgeFiles: {},
    gitChanges: {
      status: '',
      diff: '',
      diffCached: '',
      lastCommitMessages: '',
    },
    changesSinceLastChat: {},
    fileVersions: [],
  }

  it('should return base template when no overrides exist', () => {
    const result = processAgentOverrides(mockBaseTemplate, mockFileContext)
    expect(result).toEqual(mockBaseTemplate)
  })

  it('should return base template when override: true is found (no longer supported)', () => {
    const fileContextWithOverride: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/reviewer.json': JSON.stringify({
          id: 'CodebuffAI/reviewer',
          version: '0.1.7',
          override: true,
          model: openrouterModels.openrouter_claude_sonnet_4,
        }),
      },
    }

    expect(() =>
      processAgentOverrides(mockBaseTemplate, fileContextWithOverride)
    ).toThrow('Dynamic agents no longer support override: true')
  })
  it('should throw error for systemPrompt override with override: true', () => {
    const fileContextWithOverride: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/reviewer.json': JSON.stringify({
          id: 'CodebuffAI/reviewer',
          version: '0.1.7',
          override: true,
          systemPrompt: {
            type: 'append',
            content: 'Additional system instructions',
          },
        }),
      },
    }

    expect(() =>
      processAgentOverrides(mockBaseTemplate, fileContextWithOverride)
    ).toThrow('Dynamic agents no longer support override: true')
  })
  it('should throw error for systemPrompt override with external file when override: true', () => {
    const fileContextWithOverride: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/reviewer.json': JSON.stringify({
          id: 'CodebuffAI/reviewer',
          version: '0.1.7',
          override: true,
          systemPrompt: {
            type: 'append',
            path: './system-prompt.md',
          },
        }),
        '.agents/templates/system-prompt.md': 'External system prompt content',
      },
    }

    expect(() =>
      processAgentOverrides(mockBaseTemplate, fileContextWithOverride)
    ).toThrow('Dynamic agents no longer support override: true')
  })
  it('should throw error for spawnableAgents override when override: true', () => {
    const fileContextWithOverride: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/reviewer.json': JSON.stringify({
          id: 'CodebuffAI/reviewer',
          version: '0.1.7',
          override: true,
          spawnableAgents: {
            type: 'append',
            content: 'thinker',
          },
        }),
      },
    }

    expect(() =>
      processAgentOverrides(mockBaseTemplate, fileContextWithOverride)
    ).toThrow('Dynamic agents no longer support override: true')
  })

  it('should handle invalid JSON gracefully', () => {
    const fileContextWithInvalidOverride: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/reviewer.json': 'invalid json',
      },
    }

    const result = processAgentOverrides(
      mockBaseTemplate,
      fileContextWithInvalidOverride
    )
    expect(result).toEqual(mockBaseTemplate)
  })

  it('should throw error even for non-matching agent types when override: true', () => {
    const fileContextWithNonMatchingOverride: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/different-agent.json': JSON.stringify({
          id: 'CodebuffAI/different-agent',
          version: '0.1.7',
          override: true,
          model: openrouterModels.openrouter_claude_sonnet_4,
        }),
      },
    }

    expect(() =>
      processAgentOverrides(
        mockBaseTemplate,
        fileContextWithNonMatchingOverride
      )
    ).toThrow('Dynamic agents no longer support override: true')
  })
  it('should throw error for invalid model when override: true', () => {
    const fileContextWithInvalidModel: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/reviewer.json': JSON.stringify({
          id: 'CodebuffAI/reviewer',
          version: '0.1.7',
          override: true,
          model: 'invalid-model-name',
        }),
      },
    }

    expect(() =>
      processAgentOverrides(mockBaseTemplate, fileContextWithInvalidModel)
    ).toThrow('Dynamic agents no longer support override: true')
  })
})
