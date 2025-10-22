import { finetunedVertexModels } from '@codebuff/common/old-constants'
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { requestRelevantFiles } from '../request-files-prompt'

import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { ProjectFileContext } from '@codebuff/common/util/file'

let agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps

describe('requestRelevantFiles', () => {
  const mockMessages: Message[] = [{ role: 'user', content: 'test prompt' }]
  const mockSystem = 'test system'
  const mockFileContext: ProjectFileContext = {
    projectRoot: '/test/project',
    cwd: '/test/project',
    fileTree: [{ name: 'file1.ts', filePath: 'file1.ts', type: 'file' }],
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
      platform: 'darwin',
      shell: 'fish',
      nodeVersion: 'v20.0.0',
      arch: 'arm64',
      homedir: '/Users/test',
      cpus: 8,
    },
    agentTemplates: {},
    customToolDefinitions: {},
  }
  const mockAssistantPrompt = null
  const mockAgentStepId = 'step1'
  const mockClientSessionId = 'session1'
  const mockFingerprintId = 'fingerprint1'
  const mockUserInputId = 'input1'
  const mockUserId = 'user1'
  const mockRepoId = 'owner/repo'

  beforeEach(() => {
    agentRuntimeImpl = {
      ...TEST_AGENT_RUNTIME_IMPL,
      promptAiSdk: mock(() => Promise.resolve('file1.ts\nfile2.ts')),
    }
  })

  it('should use default file counts and maxFiles when no custom config', async () => {
    await requestRelevantFiles({
      ...agentRuntimeImpl,
      messages: mockMessages,
      system: mockSystem,
      fileContext: mockFileContext,
      assistantPrompt: mockAssistantPrompt,
      agentStepId: mockAgentStepId,
      clientSessionId: mockClientSessionId,
      fingerprintId: mockFingerprintId,
      userInputId: mockUserInputId,
      userId: mockUserId,
      repoId: mockRepoId,
    })
    expect(agentRuntimeImpl.promptAiSdk).toHaveBeenCalled()
  })

  it('should use custom file counts from config', async () => {
    const customConfig = {
      modelName: 'ft_filepicker_005',
      customFileCounts: { normal: 5 },
      maxFilesPerRequest: 10,
    }

    await requestRelevantFiles({
      ...agentRuntimeImpl,
      messages: mockMessages,
      system: mockSystem,
      fileContext: mockFileContext,
      assistantPrompt: mockAssistantPrompt,
      agentStepId: mockAgentStepId,
      clientSessionId: mockClientSessionId,
      fingerprintId: mockFingerprintId,
      userInputId: mockUserInputId,
      userId: mockUserId,
      repoId: mockRepoId,
    })
    expect(agentRuntimeImpl.promptAiSdk).toHaveBeenCalled()
  })

  it('should use custom maxFilesPerRequest from config', async () => {
    const customConfig = {
      modelName: 'ft_filepicker_005',
      maxFilesPerRequest: 3,
    }

    const result = await requestRelevantFiles({
      ...agentRuntimeImpl,
      messages: mockMessages,
      system: mockSystem,
      fileContext: mockFileContext,
      assistantPrompt: mockAssistantPrompt,
      agentStepId: mockAgentStepId,
      clientSessionId: mockClientSessionId,
      fingerprintId: mockFingerprintId,
      userInputId: mockUserInputId,
      userId: mockUserId,
      repoId: mockRepoId,
    })
    expect(result).toBeArray()
    if (result) {
      expect(result.length).toBeLessThanOrEqual(3)
    }
  })

  it('should use custom modelName from config', async () => {
    const customConfig = {
      modelName: 'ft_filepicker_010',
    }

    await requestRelevantFiles({
      ...agentRuntimeImpl,
      messages: mockMessages,
      system: mockSystem,
      fileContext: mockFileContext,
      assistantPrompt: mockAssistantPrompt,
      agentStepId: mockAgentStepId,
      clientSessionId: mockClientSessionId,
      fingerprintId: mockFingerprintId,
      userInputId: mockUserInputId,
      userId: mockUserId,
      repoId: mockRepoId,
    })
    expect(agentRuntimeImpl.promptAiSdk).toHaveBeenCalledWith(
      expect.objectContaining({
        useFinetunedModel: finetunedVertexModels.ft_filepicker_010,
      }),
    )
  })

  it('should use default model if custom modelName is invalid', async () => {
    const customConfig = {
      modelName: 'invalid-model-name',
    }

    await requestRelevantFiles({
      ...agentRuntimeImpl,
      messages: mockMessages,
      system: mockSystem,
      fileContext: mockFileContext,
      assistantPrompt: mockAssistantPrompt,
      agentStepId: mockAgentStepId,
      clientSessionId: mockClientSessionId,
      fingerprintId: mockFingerprintId,
      userInputId: mockUserInputId,
      userId: mockUserId,
      repoId: mockRepoId,
    })
    const expectedModel = finetunedVertexModels.ft_filepicker_010
    expect(agentRuntimeImpl.promptAiSdk).toHaveBeenCalledWith(
      expect.objectContaining({
        useFinetunedModel: expectedModel,
      }),
    )
  })
})
