import { processAgentOverrides } from '../agent-overrides'
import { AgentTemplate } from '../types'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import { ProjectFileContext } from '@codebuff/common/util/file'
import { openrouterModels } from '@codebuff/common/constants'

describe('processAgentOverrides', () => {
  const mockBaseTemplate: AgentTemplate = {
    type: AgentTemplateTypes.reviewer,
    name: 'Test Reviewer',
    description: 'Test description',
    model: openrouterModels.openrouter_claude_3_5_sonnet,
    promptSchema: { prompt: undefined },
    outputMode: 'last_message',
    includeMessageHistory: true,
    toolNames: ['end_turn'],
    stopSequences: [],
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
    systemInfo: { platform: 'darwin', shell: 'bash' },
    userKnowledgeFiles: {},
    gitChanges: { status: '', diff: '', diffCached: '', lastCommitMessages: '' },
    changesSinceLastChat: {},
    fileVersions: [],
  }

  it('should return base template when no overrides exist', () => {
    const result = processAgentOverrides(mockBaseTemplate, mockFileContext)
    expect(result).toEqual(mockBaseTemplate)
  })

  it('should apply model override', () => {
    const fileContextWithOverride: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/reviewer.json': JSON.stringify({
          type: 'CodebuffAI/reviewer',
          version: '0.1.7',
          override: true,
          model: openrouterModels.openrouter_claude_sonnet_4,
        }),
      },
    }

    const result = processAgentOverrides(mockBaseTemplate, fileContextWithOverride)
    expect(result.model).toBe(openrouterModels.openrouter_claude_sonnet_4)
  })

  it('should apply systemPrompt append override with content', () => {
    const fileContextWithOverride: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/reviewer.json': JSON.stringify({
          type: 'CodebuffAI/reviewer',
          version: '0.1.7',
          override: true,
          systemPrompt: {
            type: 'append',
            content: 'Additional system instructions',
          },
        }),
      },
    }

    const result = processAgentOverrides(mockBaseTemplate, fileContextWithOverride)
    expect(result.systemPrompt).toBe('Base system prompt\n\nAdditional system instructions')
  })

  it('should apply systemPrompt append override with external file', () => {
    const fileContextWithOverride: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/reviewer.json': JSON.stringify({
          type: 'CodebuffAI/reviewer',
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

    const result = processAgentOverrides(mockBaseTemplate, fileContextWithOverride)
    expect(result.systemPrompt).toBe('Base system prompt\n\nExternal system prompt content')
  })

  it('should apply spawnableAgents append override', () => {
    const fileContextWithOverride: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/reviewer.json': JSON.stringify({
          type: 'CodebuffAI/reviewer',
          version: '0.1.7',
          override: true,
          spawnableAgents: {
            type: 'append',
            content: 'thinker',
          },
        }),
      },
    }

    const result = processAgentOverrides(mockBaseTemplate, fileContextWithOverride)
    expect(result.spawnableAgents).toEqual(['thinker'])
  })

  it('should handle invalid JSON gracefully', () => {
    const fileContextWithInvalidOverride: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/reviewer.json': 'invalid json',
      },
    }

    const result = processAgentOverrides(mockBaseTemplate, fileContextWithInvalidOverride)
    expect(result).toEqual(mockBaseTemplate)
  })

  it('should ignore non-matching agent types', () => {
    const fileContextWithNonMatchingOverride: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/different-agent.json': JSON.stringify({
          type: 'CodebuffAI/different-agent',
          version: '0.1.7',
          override: true,
          model: openrouterModels.openrouter_claude_sonnet_4,
        }),
      },
    }

    const result = processAgentOverrides(mockBaseTemplate, fileContextWithNonMatchingOverride)
    expect(result).toEqual(mockBaseTemplate)
  })

  it('should reject invalid model names and use base template', () => {
    const fileContextWithInvalidModel: ProjectFileContext = {
      ...mockFileContext,
      agentTemplates: {
        '.agents/templates/reviewer.json': JSON.stringify({
          type: 'CodebuffAI/reviewer',
          version: '0.1.7',
          override: true,
          model: 'invalid-model-name',
        }),
      },
    }

    const result = processAgentOverrides(mockBaseTemplate, fileContextWithInvalidModel)
    // Should return base template since invalid model was rejected
    expect(result).toEqual(mockBaseTemplate)
  })
})
