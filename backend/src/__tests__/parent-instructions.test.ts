import { AgentState } from '@codebuff/common/types/session-state'
import { FileTreeNode, ProjectFileContext } from '@codebuff/common/util/file'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { DynamicAgentTemplate } from '@codebuff/common/types/dynamic-agent-template'
import { agentRegistry } from '../templates/agent-registry'
import { collectParentInstructions } from '../templates/strings'
import { AgentTemplate } from '../templates/types'

// Helper to create a mock ProjectFileContext
const createMockFileContext = (
  agentTemplates: Record<string, DynamicAgentTemplate>
): ProjectFileContext => ({
  projectRoot: '/test',
  cwd: '/test',
  knowledgeFiles: {},
  userKnowledgeFiles: {},
  agentTemplates,
  fileTree: [
    {
      type: 'directory',
      name: 'test',
      children: [],
      filePath: '/test',
    } as FileTreeNode,
  ],
  fileTokenScores: {},
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
    homedir: '/test',
    cpus: 1,
  },
})

describe('Parent Instructions Injection', () => {
  beforeEach(() => {
    agentRegistry.reset()
  })

  afterEach(() => {
    agentRegistry.reset()
  })

  it('should inject parent instructions into userInputPrompt', async () => {
    // Mock file context with agent templates
    const fileContext = createMockFileContext({
      'knowledge-keeper': {
        version: '1.0.0',
        id: 'knowledge-keeper',
        name: 'Knowledge Keeper',
        override: false,
        purpose: 'Test agent',
        model: 'anthropic/claude-4-sonnet-20250522',
        outputMode: 'last_message',
        includeMessageHistory: false,
        toolNames: ['end_turn'],
        spawnableAgents: [],
        parentInstructions: {
          researcher:
            'Spawn knowledge-keeper when you find documentation gaps.',
          file_picker: 'Spawn knowledge-keeper when you discover missing docs.',
        },
        systemPrompt: 'You are a test agent.',
        userInputPrompt: 'Process the user request.',
        agentStepPrompt: 'Continue processing.',
        initialAssistantMessage: '',
        initialAssistantPrefix: '',
        stepAssistantMessage: '',
        stepAssistantPrefix: '',
      },
      researcher: {
        version: '1.0.0',
        id: 'researcher',
        name: 'Researcher',
        override: false,
        purpose: 'Research agent',
        model: 'anthropic/claude-4-sonnet-20250522',
        outputMode: 'last_message',
        includeMessageHistory: false,
        toolNames: ['end_turn'],
        spawnableAgents: [],
        systemPrompt: 'You are a researcher.',
        userInputPrompt: 'Research the topic.',
        agentStepPrompt: 'Continue research.',
        initialAssistantMessage: '',
        initialAssistantPrefix: '',
        stepAssistantMessage: '',
        stepAssistantPrefix: '',
      },
    })

    // Initialize the registry
    await agentRegistry.initialize(fileContext)

    // Get the researcher template
    const researcherTemplate = agentRegistry.getTemplate(
      'researcher'
    ) as AgentTemplate
    expect(researcherTemplate).toBeDefined()

    // Create mock agent state
    const agentState: AgentState = {
      agentId: 'test-agent',
      agentType: 'researcher',
      agentContext: {},
      subagents: [],
      messageHistory: [],
      stepsRemaining: 10,
      report: {},
    }

    // Test parent instructions collection directly
    const parentInstructions = await collectParentInstructions(
      'researcher',
      agentRegistry
    )

    // Verify that parent instructions are collected
    expect(parentInstructions).toHaveLength(1)
    expect(parentInstructions[0]).toBe(
      'Spawn knowledge-keeper when you find documentation gaps.'
    )
  })

  it('should not inject parent instructions when none exist', async () => {
    // Mock file context with agent templates without parentInstructions
    const fileContext = createMockFileContext({
      researcher: {
        version: '1.0.0',
        id: 'researcher',
        override: false,
        name: 'Researcher',
        purpose: 'Research agent',
        model: 'anthropic/claude-4-sonnet-20250522',
        outputMode: 'last_message',
        includeMessageHistory: false,
        toolNames: ['end_turn'],
        spawnableAgents: [],
        systemPrompt: 'You are a researcher.',
        userInputPrompt: 'Research the topic.',
        agentStepPrompt: 'Continue research.',
        initialAssistantMessage: '',
        initialAssistantPrefix: '',
        stepAssistantMessage: '',
        stepAssistantPrefix: '',
      },
    })

    // Initialize the registry
    await agentRegistry.initialize(fileContext)

    // Get the researcher template
    const researcherTemplate = agentRegistry.getTemplate(
      'researcher'
    ) as AgentTemplate
    expect(researcherTemplate).toBeDefined()

    // Create mock agent state
    const agentState: AgentState = {
      agentId: 'test-agent',
      agentType: 'researcher',
      agentContext: {},
      subagents: [],
      messageHistory: [],
      stepsRemaining: 10,
      report: {},
    }

    // Test parent instructions collection directly
    const parentInstructions = await collectParentInstructions(
      'researcher',
      agentRegistry
    )

    // Verify that no parent instructions are collected
    expect(parentInstructions).toHaveLength(0)
  })

  it('should handle multiple agents with instructions for the same target', async () => {
    // Mock file context with multiple agents having instructions for researcher
    const fileContext = createMockFileContext({
      'knowledge-keeper': {
        version: '1.0.0',
        id: 'knowledge-keeper',
        name: 'Knowledge Keeper',
        override: false,
        purpose: 'Test agent',
        model: 'anthropic/claude-4-sonnet-20250522',
        outputMode: 'last_message',
        includeMessageHistory: false,
        toolNames: ['end_turn'],
        spawnableAgents: [],
        parentInstructions: {
          researcher: 'First instruction for researcher.',
        },
        systemPrompt: 'You are a test agent.',
        userInputPrompt: 'Process the user request.',
        agentStepPrompt: 'Continue processing.',
        initialAssistantMessage: '',
        initialAssistantPrefix: '',
        stepAssistantMessage: '',
        stepAssistantPrefix: '',
      },
      planner: {
        version: '1.0.0',
        id: 'planner',
        name: 'Planner',
        override: false,
        purpose: 'Planning agent',
        model: 'anthropic/claude-4-sonnet-20250522',
        outputMode: 'last_message',
        includeMessageHistory: false,
        toolNames: ['end_turn'],
        spawnableAgents: [],
        parentInstructions: {
          researcher: 'Second instruction for researcher.',
        },
        systemPrompt: 'You are a planner.',
        userInputPrompt: 'Plan the task.',
        agentStepPrompt: 'Continue planning.',
        initialAssistantMessage: '',
        initialAssistantPrefix: '',
        stepAssistantMessage: '',
        stepAssistantPrefix: '',
      },
      researcher: {
        version: '1.0.0',
        id: 'researcher',
        name: 'Researcher',
        override: false,
        purpose: 'Research agent',
        model: 'anthropic/claude-4-sonnet-20250522',
        outputMode: 'last_message',
        includeMessageHistory: false,
        toolNames: ['end_turn'],
        spawnableAgents: [],
        systemPrompt: 'You are a researcher.',
        userInputPrompt: 'Research the topic.',
        agentStepPrompt: 'Continue research.',
        initialAssistantMessage: '',
        initialAssistantPrefix: '',
        stepAssistantMessage: '',
        stepAssistantPrefix: '',
      },
    })

    // Initialize the registry
    await agentRegistry.initialize(fileContext)

    // Get the researcher template
    const researcherTemplate = agentRegistry.getTemplate(
      'researcher'
    ) as AgentTemplate
    expect(researcherTemplate).toBeDefined()

    // Create mock agent state
    const agentState: AgentState = {
      agentId: 'test-agent',
      agentType: 'researcher',
      agentContext: {},
      subagents: [],
      messageHistory: [],
      stepsRemaining: 10,
      report: {},
    }

    // Test parent instructions collection directly
    const parentInstructions = await collectParentInstructions(
      'researcher',
      agentRegistry
    )

    // Verify that both parent instructions are collected
    expect(parentInstructions).toHaveLength(2)
    expect(parentInstructions).toContain('First instruction for researcher.')
    expect(parentInstructions).toContain('Second instruction for researcher.')
  })
})
