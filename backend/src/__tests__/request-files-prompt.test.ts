import { finetunedVertexModels } from '@codebuff/common/constants'
import {
  beforeEach,
  mock as bunMockFn,
  spyOn as bunSpyOn,
  describe,
  expect,
  it,
} from 'bun:test'

import * as OriginalRequestFilesPromptModule from '../find-files/request-files-prompt'
import * as geminiWithFallbacksModule from '../llm-apis/gemini-with-fallbacks'

import type { CostMode } from '@codebuff/common/constants'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { Mock } from 'bun:test'

bunMockFn.module('../llm-apis/gemini-with-fallbacks', () => ({
  promptFlashWithFallbacks: bunMockFn(() =>
    Promise.resolve('file1.ts\nfile2.ts'),
  ),
}))

bunMockFn.module('../websockets/request-context', () => ({
  getRequestContext: bunMockFn(() => ({
    approvedOrgIdForRepo: 'org123',
    isRepoApprovedForUserInOrg: true,
  })),
}))

bunMockFn.module('../util/logger', () => ({
  logger: {
    info: bunMockFn(() => {}),
    error: bunMockFn(() => {}),
    warn: bunMockFn(() => {}),
    debug: bunMockFn(() => {}),
  },
}))

bunMockFn.module('@codebuff/common/db', () => ({
  default: {
    insert: bunMockFn(() => ({
      values: bunMockFn(() => ({
        onConflictDoNothing: bunMockFn(() => Promise.resolve()),
      })),
    })),
  },
}))
bunMockFn.module('@codebuff/bigquery', () => ({
  insertTrace: bunMockFn(() => Promise.resolve()),
}))

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
  const mockCostMode: CostMode = 'normal'
  const mockRepoId = 'owner/repo'

  let getCustomFilePickerConfigForOrgSpy: any // Explicitly typed as any

  beforeEach(() => {
    // If the spy was created in a previous test, restore it
    if (
      getCustomFilePickerConfigForOrgSpy &&
      typeof getCustomFilePickerConfigForOrgSpy.mockRestore === 'function'
    ) {
      getCustomFilePickerConfigForOrgSpy.mockRestore()
      getCustomFilePickerConfigForOrgSpy = undefined
    }

    // Use the directly imported bunSpyOn
    getCustomFilePickerConfigForOrgSpy = bunSpyOn(
      OriginalRequestFilesPromptModule,
      'getCustomFilePickerConfigForOrg',
    ).mockResolvedValue(null)

    const promptFlashWithFallbacksMock =
      geminiWithFallbacksModule.promptFlashWithFallbacks as Mock<
        typeof geminiWithFallbacksModule.promptFlashWithFallbacks
      >
    promptFlashWithFallbacksMock.mockResolvedValue('file1.ts\nfile2.ts')
    promptFlashWithFallbacksMock.mockClear()
  })

  it('should use default file counts and maxFiles when no custom config', async () => {
    await OriginalRequestFilesPromptModule.requestRelevantFiles(
      { messages: mockMessages, system: mockSystem },
      mockFileContext,
      mockAssistantPrompt,
      mockAgentStepId,
      mockClientSessionId,
      mockFingerprintId,
      mockUserInputId,
      mockUserId,
      mockRepoId,
    )
    expect(
      geminiWithFallbacksModule.promptFlashWithFallbacks,
    ).toHaveBeenCalled()
    expect(getCustomFilePickerConfigForOrgSpy).toHaveBeenCalled()
  })

  it('should use custom file counts from config', async () => {
    const customConfig = {
      modelName: 'ft_filepicker_005',
      customFileCounts: { normal: 5 },
      maxFilesPerRequest: 10,
    }
    getCustomFilePickerConfigForOrgSpy!.mockResolvedValue(customConfig as any)

    await OriginalRequestFilesPromptModule.requestRelevantFiles(
      { messages: mockMessages, system: mockSystem },
      mockFileContext,
      mockAssistantPrompt,
      mockAgentStepId,
      mockClientSessionId,
      mockFingerprintId,
      mockUserInputId,
      mockUserId,
      mockRepoId,
    )
    expect(
      geminiWithFallbacksModule.promptFlashWithFallbacks,
    ).toHaveBeenCalled()
    expect(getCustomFilePickerConfigForOrgSpy).toHaveBeenCalled()
  })

  it('should use custom maxFilesPerRequest from config', async () => {
    const customConfig = {
      modelName: 'ft_filepicker_005',
      maxFilesPerRequest: 3,
    }
    getCustomFilePickerConfigForOrgSpy!.mockResolvedValue(customConfig as any)

    const result = await OriginalRequestFilesPromptModule.requestRelevantFiles(
      { messages: mockMessages, system: mockSystem },
      mockFileContext,
      mockAssistantPrompt,
      mockAgentStepId,
      mockClientSessionId,
      mockFingerprintId,
      mockUserInputId,
      mockUserId,
      mockRepoId,
    )
    expect(result).toBeArray()
    if (result) {
      expect(result.length).toBeLessThanOrEqual(3)
    }
    expect(getCustomFilePickerConfigForOrgSpy).toHaveBeenCalled()
  })

  it('should use custom modelName from config', async () => {
    const customConfig = {
      modelName: 'ft_filepicker_010',
    }
    getCustomFilePickerConfigForOrgSpy!.mockResolvedValue(customConfig as any)

    await OriginalRequestFilesPromptModule.requestRelevantFiles(
      { messages: mockMessages, system: mockSystem },
      mockFileContext,
      mockAssistantPrompt,
      mockAgentStepId,
      mockClientSessionId,
      mockFingerprintId,
      mockUserInputId,
      mockUserId,
      mockRepoId,
    )
    expect(
      geminiWithFallbacksModule.promptFlashWithFallbacks,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        useFinetunedModel: finetunedVertexModels.ft_filepicker_010,
      }),
    )
    expect(getCustomFilePickerConfigForOrgSpy).toHaveBeenCalled()
  })

  it('should use default model if custom modelName is invalid', async () => {
    const customConfig = {
      modelName: 'invalid-model-name',
    }
    getCustomFilePickerConfigForOrgSpy!.mockResolvedValue(customConfig as any)

    await OriginalRequestFilesPromptModule.requestRelevantFiles(
      { messages: mockMessages, system: mockSystem },
      mockFileContext,
      mockAssistantPrompt,
      mockAgentStepId,
      mockClientSessionId,
      mockFingerprintId,
      mockUserInputId,
      mockUserId,
      mockRepoId,
    )
    const expectedModel = finetunedVertexModels.ft_filepicker_010
    expect(
      geminiWithFallbacksModule.promptFlashWithFallbacks,
    ).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        useFinetunedModel: expectedModel,
      }),
    )
    expect(getCustomFilePickerConfigForOrgSpy).toHaveBeenCalled()
  })
})
