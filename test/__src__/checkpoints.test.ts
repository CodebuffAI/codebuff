import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { DEFAULT_MAX_FILES } from 'common/project-file-tree'
import {
  AgentState,
  getInitialAgentState,
  ToolResult,
} from 'common/types/agent-state'
import { ProjectFileContext } from 'common/util/file'

import {
  CheckpointManager,
  CheckpointsDisabledError,
} from '../../npm-app/src/checkpoints/checkpoint-manager'

const mockFileContext: ProjectFileContext = {
  currentWorkingDirectory: '/test',
  fileTree: [],
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
    platform: 'test',
    shell: 'test',
    nodeVersion: 'test',
    arch: 'test',
    homedir: '/home/test',
    cpus: 1,
  },
  fileVersions: [],
}

function createMockAgentState(
  messageCount: number = 1,
  fileCount: number = 0
): AgentState {
  const agentState = getInitialAgentState({
    ...mockFileContext,
    fileTree: Array(fileCount).fill({
      type: 'file',
      name: 'test.txt',
      filePath: 'test.txt',
      lastReadTime: Date.now(),
    }),
  })

  for (let i = 0; i < messageCount; i++) {
    agentState.messageHistory.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Test message ${i}`,
    })
  }

  return agentState
}

const mockFs = {
  default: {
    mkdirSync: (path: string, options: any) => {
      return undefined
    },
    lstat: () => ({
      isFile: () => true,
      isDirectory: () => true,
      size: 1000,
      mtimeMs: Date.now(),
    }),
    readFileSync: () => '',
    writeFileSync: () => {},
    existsSync: () => true,
    promises: {
      mkdir: () => Promise.resolve(),
      writeFile: () => Promise.resolve(),
      readFile: () => Promise.resolve(''),
    },
  },
}

describe('CheckpointManager', () => {
  let checkpointManager: CheckpointManager
  let restoreCount: number
  const mockToolResults: ToolResult[] = []

  beforeEach(() => {
    restoreCount = 0

    mock.module('fs', () => mockFs.default)
    mock.module('node:fs', () => mockFs.default)
    mock.module('node:fs/promises', () => mockFs.default.promises)
    mock.module('fs/promises', () => mockFs.default.promises)

    mock.module('isomorphic-git', () => ({
      statusMatrix: () => [['/test/file.txt', 1, 1, 1]],
      add: () => Promise.resolve(),
      commit: () => Promise.resolve('mock-commit'),
      writeRef: () => Promise.resolve(),
      resolveRef: () => Promise.resolve('HEAD'),
      init: () => Promise.resolve(),
      checkout: () => Promise.resolve(),
      resetIndex: () => Promise.resolve(),
    }))

    mock.module('crypto', () => ({
      createHash: () => ({
        update: () => ({
          digest: () => 'mock-hash',
        }),
      }),
    }))

    mock.module('child_process', () => ({
      execFileSync: () => Buffer.from(''),
    }))

    mock.module('../../npm-app/src/project-files', () => ({
      getProjectRoot: () => '/test/project',
      getProjectDataDir: () => '/test/data',
    }))

    mock.module('../../npm-app/src/checkpoints/file-manager', () => ({
      fs: mockFs.default,
      hasUnsavedChanges: () => Promise.resolve(true),
      getLatestCommit: () => Promise.resolve('mock-commit-hash'),
      storeFileState: () => Promise.resolve('mock-commit-hash'),
      restoreFileState: async () => {
        restoreCount++
        return Promise.resolve()
      },
      getBareRepoPath: () => '/test/data',
      initializeCheckpointFileManager: () => Promise.resolve(),
      statusMatrix: () => [['/test/file.txt', 1, 1, 1]],
    }))

    mock.module('worker_threads', () => ({
      Worker: class {
        handler: Function | null = null

        on(event: string, handler: Function) {
          if (event === 'message') {
            this.handler = handler
            handler({
              id: JSON.stringify({
                type: 'store',
                projectDir: '/test/project',
                bareRepoPath: '/test/data',
                message: 'test',
              }),
              success: true,
              result: 'mock-commit-hash',
            })
          }
          return this
        }

        postMessage(message: any) {}

        off() {}
      },
    }))

    checkpointManager = new CheckpointManager()
  })

  it('should add a checkpoint and return its ID', async () => {
    const agentState = createMockAgentState()
    const userInput = 'Test user input'

    const { checkpoint, created } = await checkpointManager.addCheckpoint(
      agentState,
      mockToolResults,
      userInput
    )

    expect(created).toBe(true)
    expect(checkpoint.userInput).toBe(userInput)
    expect(checkpoint.historyLength).toBe(agentState.messageHistory.length)
    expect(checkpoint.lastToolResultsString).toBe(
      JSON.stringify(mockToolResults)
    )
  })

  it('should retrieve a checkpoint by ID', async () => {
    const agentState = createMockAgentState()
    const { checkpoint } = await checkpointManager.addCheckpoint(
      agentState,
      mockToolResults,
      'Test input'
    )

    expect(checkpoint.id).toBe(1)
    expect(JSON.parse(checkpoint.agentStateString)).toEqual(agentState)
    expect(JSON.parse(checkpoint.lastToolResultsString)).toEqual(
      mockToolResults
    )
  })

  it('should throw when getting a non-existent checkpoint', () => {
    expect(() => checkpointManager.getLatestCheckpoint()).toThrow(
      'No checkpoints available'
    )
  })

  it('should get all checkpoints', async () => {
    mock.module('../../npm-app/src/checkpoints/file-manager', () => ({
      ...require('../../npm-app/src/checkpoints/file-manager'),
      hasUnsavedChanges: () => Promise.resolve(true),
    }))

    const { checkpoint: checkpoint1 } = await checkpointManager.addCheckpoint(
      createMockAgentState(1),
      mockToolResults,
      'Input 1'
    )
    const { checkpoint: checkpoint2 } = await checkpointManager.addCheckpoint(
      createMockAgentState(2),
      mockToolResults,
      'Input 2'
    )
    const { checkpoint: checkpoint3 } = await checkpointManager.addCheckpoint(
      createMockAgentState(3),
      mockToolResults,
      'Input 3'
    )

    const checkpoints = checkpointManager.checkpoints
    expect(checkpoints.length).toBe(3)
    expect(checkpoints[0].id).toBe(1)
    expect(checkpoints[1].id).toBe(2)
    expect(checkpoints[2].id).toBe(3)
  })

  it('should get the latest checkpoint', async () => {
    await checkpointManager.addCheckpoint(
      createMockAgentState(1),
      mockToolResults,
      'Input 1'
    )
    const { checkpoint: checkpoint2 } = await checkpointManager.addCheckpoint(
      createMockAgentState(2),
      mockToolResults,
      'Input 2'
    )

    const latestCheckpoint = checkpointManager.getLatestCheckpoint()
    expect(latestCheckpoint.id).toBe(checkpoint2.id)
  })

  it('should throw for latest checkpoint when no checkpoints exist', () => {
    expect(() => checkpointManager.getLatestCheckpoint()).toThrow(
      'No checkpoints available'
    )
  })

  it('should clear all checkpoints', async () => {
    await checkpointManager.addCheckpoint(
      createMockAgentState(),
      mockToolResults,
      'Input 1'
    )
    await checkpointManager.addCheckpoint(
      createMockAgentState(),
      mockToolResults,
      'Input 2'
    )

    checkpointManager.clearCheckpoints()

    expect(checkpointManager.checkpoints.length).toBe(0)
    expect(() => checkpointManager.getLatestCheckpoint()).toThrow(
      'No checkpoints available'
    )
  })

  it('should maintain all checkpoints', async () => {
    for (let i = 0; i < 7; i++) {
      await checkpointManager.addCheckpoint(
        createMockAgentState(),
        mockToolResults,
        `Input ${i}`
      )
    }

    const checkpoints = checkpointManager.checkpoints

    expect(checkpoints.length).toBe(7)
    expect(checkpoints[0].id).toBe(1)
    expect(checkpoints[6].id).toBe(7)
  })

  it('should format checkpoints as a string', async () => {
    const { checkpoint } = await checkpointManager.addCheckpoint(
      createMockAgentState(),
      mockToolResults,
      'Test input'
    )

    const formatted = checkpointManager.getCheckpointsAsString()

    expect(formatted).toContain('Agent State Checkpoints')
    expect(formatted).toContain('#1')
    expect(formatted).toContain('Test input')
  })

  it('should format detailed checkpoint information', async () => {
    const { checkpoint } = await checkpointManager.addCheckpoint(
      createMockAgentState(3),
      mockToolResults,
      'Detailed test'
    )

    const details = checkpointManager.getCheckpointsAsString(true)

    expect(details).toContain(`#${checkpoint.id}`)
    expect(details).toContain('Detailed test')
    expect(details).toContain('\u001b[34mMessages\u001b[39m: 3')
  })

  it('should return error message when checkpoints are disabled', () => {
    checkpointManager.disabledReason = 'Project too large'
    const details = checkpointManager.getCheckpointsAsString()
    expect(details).toContain(
      '\u001B[31mCheckpoints not enabled: Project too large\u001B[39m'
    )
  })

  it('should reset the ID counter when clearing checkpoints', async () => {
    await checkpointManager.addCheckpoint(
      createMockAgentState(),
      mockToolResults,
      'First batch'
    )
    checkpointManager.clearCheckpoints()
    const { checkpoint } = await checkpointManager.addCheckpoint(
      createMockAgentState(),
      mockToolResults,
      'Second batch'
    )

    expect(checkpoint.id).toBe(1)
  })

  describe('checkpoint state management', () => {
    it('should track parent/child relationships between checkpoints', async () => {
      const { checkpoint: checkpoint1 } = await checkpointManager.addCheckpoint(
        createMockAgentState(1),
        mockToolResults,
        'First checkpoint'
      )
      const { checkpoint: checkpoint2 } = await checkpointManager.addCheckpoint(
        createMockAgentState(2),
        mockToolResults,
        'Second checkpoint'
      )

      expect(checkpoint2.parentId).toBe(checkpoint1.id)
      expect(checkpointManager.currentCheckpointId).toBe(checkpoint2.id)
    })

    it('should not create duplicate checkpoints for identical states', async () => {
      mock.module('../../npm-app/src/checkpoints/file-manager', () => ({
        fs: mockFs.default,
        hasUnsavedChanges: () => Promise.resolve(false),
        getLatestCommit: () => Promise.resolve('mock-commit-hash'),
        storeFileState: () => Promise.resolve('mock-commit-hash'),
        restoreFileState: async () => {
          restoreCount++
          return Promise.resolve()
        },
        getBareRepoPath: () => '/test/data',
        initializeCheckpointFileManager: () => Promise.resolve(),
      }))

      checkpointManager = new CheckpointManager()

      const agentState = createMockAgentState(1)
      const { checkpoint: checkpoint1, created: created1 } =
        await checkpointManager.addCheckpoint(
          agentState,
          mockToolResults,
          'First attempt'
        )
      const { checkpoint: checkpoint2, created: created2 } =
        await checkpointManager.addCheckpoint(
          agentState,
          mockToolResults,
          'Second attempt'
        )

      expect(created1).toBe(true)
      expect(created2).toBe(false)
      expect(checkpoint2.id).toBe(checkpoint1.id)
    })

    it('should maintain undo/redo chain correctly', async () => {
      restoreCount = 0

      // Create a fresh checkpoint manager with clean mocks
      const fileManagerMock = {
        fs: mockFs.default,
        hasUnsavedChanges: () => Promise.resolve(true),
        getLatestCommit: () => Promise.resolve('mock-commit-hash'),
        storeFileState: () => Promise.resolve('mock-commit-hash'),
        restoreFileState: async () => {
          restoreCount++
          return Promise.resolve()
        },
        getBareRepoPath: () => '/test/data',
        initializeCheckpointFileManager: () => Promise.resolve(),
        statusMatrix: () => [['/test/file.txt', 1, 1, 1]],
      }

      mock.module(
        '../../npm-app/src/checkpoints/file-manager',
        () => fileManagerMock
      )

      // Reset the worker mock to handle both store and restore operations
      mock.module('worker_threads', () => ({
        Worker: class {
          handler: Function | null = null
          on(event: string, handler: Function) {
            if (event === 'message') {
              this.handler = handler
            }
            return this
          }
          postMessage(message: any) {
            if (this.handler) {
              if (message.type === 'restore') {
                // For restore operations, call restoreFileState directly
                fileManagerMock.restoreFileState().then(() => {
                  this.handler!({
                    id: message.id,
                    success: true,
                    result: undefined,
                  })
                })
              } else {
                // For store operations, just return mock commit hash
                this.handler({
                  id: message.id,
                  success: true,
                  result: 'mock-commit-hash',
                })
              }
            }
          }
          off() {}
        },
      }))

      checkpointManager = new CheckpointManager()

      const { checkpoint: checkpoint1 } = await checkpointManager.addCheckpoint(
        createMockAgentState(1),
        mockToolResults,
        'First'
      )
      const { checkpoint: checkpoint2 } = await checkpointManager.addCheckpoint(
        createMockAgentState(2),
        mockToolResults,
        'Second'
      )
      const { checkpoint: checkpoint3 } = await checkpointManager.addCheckpoint(
        createMockAgentState(3),
        mockToolResults,
        'Third'
      )

      // Undo twice
      await checkpointManager.restoreUndoCheckpoint() // Goes to checkpoint2
      await checkpointManager.restoreUndoCheckpoint() // Goes to checkpoint1

      expect(checkpointManager.currentCheckpointId).toBe(checkpoint1.id)
      expect(restoreCount).toBe(2)

      // Redo once
      await checkpointManager.restoreRedoCheckpoint() // Goes back to checkpoint2

      expect(checkpointManager.currentCheckpointId).toBe(checkpoint2.id)
      expect(restoreCount).toBe(3)
    })

    it('should clear redo history when new checkpoint is added', async () => {
      restoreCount = 0

      // Create a fresh checkpoint manager with clean mocks
      const fileManagerMock = {
        fs: mockFs.default,
        hasUnsavedChanges: () => Promise.resolve(true),
        getLatestCommit: () => Promise.resolve('mock-commit-hash'),
        storeFileState: () => Promise.resolve('mock-commit-hash'),
        restoreFileState: async () => {
          restoreCount++
          return Promise.resolve()
        },
        getBareRepoPath: () => '/test/data',
        initializeCheckpointFileManager: () => Promise.resolve(),
        statusMatrix: () => [['/test/file.txt', 1, 1, 1]],
      }

      mock.module(
        '../../npm-app/src/checkpoints/file-manager',
        () => fileManagerMock
      )

      // Reset the worker mock to handle both store and restore operations
      mock.module('worker_threads', () => ({
        Worker: class {
          handler: Function | null = null
          on(event: string, handler: Function) {
            if (event === 'message') {
              this.handler = handler
            }
            return this
          }
          postMessage(message: any) {
            if (this.handler) {
              if (message.type === 'restore') {
                // For restore operations, call restoreFileState directly
                fileManagerMock.restoreFileState().then(() => {
                  this.handler!({
                    id: message.id,
                    success: true,
                    result: undefined,
                  })
                })
              } else {
                // For store operations, just return mock commit hash
                this.handler({
                  id: message.id,
                  success: true,
                  result: 'mock-commit-hash',
                })
              }
            }
          }
          off() {}
        },
      }))

      checkpointManager = new CheckpointManager()

      const { checkpoint: checkpoint1 } = await checkpointManager.addCheckpoint(
        createMockAgentState(1),
        mockToolResults,
        'First'
      )
      const { checkpoint: checkpoint2 } = await checkpointManager.addCheckpoint(
        createMockAgentState(2),
        mockToolResults,
        'Second'
      )

      // Undo to first checkpoint
      await checkpointManager.restoreUndoCheckpoint()
      expect(checkpointManager.currentCheckpointId).toBe(checkpoint1.id)
      expect(restoreCount).toBe(1)

      // Add new checkpoint - should clear redo history
      const { checkpoint: checkpoint3 } = await checkpointManager.addCheckpoint(
        createMockAgentState(3),
        mockToolResults,
        'Third'
      )

      // Try to redo - should fail since history was cleared
      await expect(checkpointManager.restoreRedoCheckpoint()).rejects.toThrow(
        'Nothing to redo'
      )
    })

    it('should reset undo ids when restoring checkpoint with resetUndoIds=true', async () => {
      restoreCount = 0

      // Create a fresh checkpoint manager with clean mocks
      const fileManagerMock = {
        fs: mockFs.default,
        hasUnsavedChanges: () => Promise.resolve(true),
        getLatestCommit: () => Promise.resolve('mock-commit-hash'),
        storeFileState: () => Promise.resolve('mock-commit-hash'),
        restoreFileState: async () => {
          restoreCount++
          return Promise.resolve()
        },
        getBareRepoPath: () => '/test/data',
        initializeCheckpointFileManager: () => Promise.resolve(),
        statusMatrix: () => [['/test/file.txt', 1, 1, 1]],
      }

      mock.module(
        '../../npm-app/src/checkpoints/file-manager',
        () => fileManagerMock
      )

      // Reset the worker mock to handle both store and restore operations
      mock.module('worker_threads', () => ({
        Worker: class {
          handler: Function | null = null
          on(event: string, handler: Function) {
            if (event === 'message') {
              this.handler = handler
            }
            return this
          }
          postMessage(message: any) {
            if (this.handler) {
              if (message.type === 'restore') {
                // For restore operations, call restoreFileState directly
                fileManagerMock.restoreFileState().then(() => {
                  this.handler!({
                    id: message.id,
                    success: true,
                    result: undefined,
                  })
                })
              } else {
                // For store operations, just return mock commit hash
                this.handler({
                  id: message.id,
                  success: true,
                  result: 'mock-commit-hash',
                })
              }
            }
          }
          off() {}
        },
      }))

      checkpointManager = new CheckpointManager()

      // Create a few checkpoints
      const { checkpoint: checkpoint1 } = await checkpointManager.addCheckpoint(
        createMockAgentState(1),
        mockToolResults,
        'First'
      )
      const { checkpoint: checkpoint2 } = await checkpointManager.addCheckpoint(
        createMockAgentState(2),
        mockToolResults,
        'Second'
      )

      // Undo to first checkpoint to populate undo ids
      await checkpointManager.restoreUndoCheckpoint()
      expect(checkpointManager.currentCheckpointId).toBe(checkpoint1.id)

      // Restore checkpoint2 with resetUndoIds=true
      await checkpointManager.restoreCheckointFileState({
        id: checkpoint2.id,
        resetUndoIds: true,
      })

      // Try to redo - should fail since undo history was cleared
      await expect(checkpointManager.restoreRedoCheckpoint()).rejects.toThrow(
        'Nothing to redo'
      )
    })

    it('should not reset undo ids when restoring checkpoint with resetUndoIds=false', async () => {
      restoreCount = 0

      // Create a fresh checkpoint manager with clean mocks
      const fileManagerMock = {
        fs: mockFs.default,
        hasUnsavedChanges: () => Promise.resolve(true),
        getLatestCommit: () => Promise.resolve('mock-commit-hash'),
        storeFileState: () => Promise.resolve('mock-commit-hash'),
        restoreFileState: async () => {
          restoreCount++
          return Promise.resolve()
        },
        getBareRepoPath: () => '/test/data',
        initializeCheckpointFileManager: () => Promise.resolve(),
        statusMatrix: () => [['/test/file.txt', 1, 1, 1]],
      }

      mock.module(
        '../../npm-app/src/checkpoints/file-manager',
        () => fileManagerMock
      )

      // Reset the worker mock to handle both store and restore operations
      mock.module('worker_threads', () => ({
        Worker: class {
          handler: Function | null = null
          on(event: string, handler: Function) {
            if (event === 'message') {
              this.handler = handler
            }
            return this
          }
          postMessage(message: any) {
            if (this.handler) {
              if (message.type === 'restore') {
                // For restore operations, call restoreFileState directly
                fileManagerMock.restoreFileState().then(() => {
                  this.handler!({
                    id: message.id,
                    success: true,
                    result: undefined,
                  })
                })
              } else {
                // For store operations, just return mock commit hash
                this.handler({
                  id: message.id,
                  success: true,
                  result: 'mock-commit-hash',
                })
              }
            }
          }
          off() {}
        },
      }))

      checkpointManager = new CheckpointManager()

      // Create a few checkpoints
      const { checkpoint: checkpoint1 } = await checkpointManager.addCheckpoint(
        createMockAgentState(1),
        mockToolResults,
        'First'
      )
      const { checkpoint: checkpoint2 } = await checkpointManager.addCheckpoint(
        createMockAgentState(2),
        mockToolResults,
        'Second'
      )

      // Undo to first checkpoint to populate undo ids
      await checkpointManager.restoreUndoCheckpoint()
      expect(checkpointManager.currentCheckpointId).toBe(checkpoint1.id)

      // Restore checkpoint2 with resetUndoIds=false
      await checkpointManager.restoreCheckointFileState({
        id: checkpoint2.id,
        resetUndoIds: false,
      })

      // Should be able to redo since undo history was preserved
      await checkpointManager.restoreRedoCheckpoint()
      expect(checkpointManager.currentCheckpointId).toBe(checkpoint2.id)
    })
  })

  describe('error handling', () => {
    it('should disable checkpoints when project is too large', async () => {
      const largeAgentState = createMockAgentState(1, DEFAULT_MAX_FILES + 1)

      await expect(
        checkpointManager.addCheckpoint(
          largeAgentState,
          mockToolResults,
          'Too large'
        )
      ).rejects.toThrow(CheckpointsDisabledError)

      expect(checkpointManager.disabledReason).toBe('Project too large')
    })

    it('should propagate errors from disabled state', async () => {
      checkpointManager.disabledReason = 'Test error'

      await expect(
        checkpointManager.addCheckpoint(
          createMockAgentState(),
          mockToolResults,
          'Test'
        )
      ).rejects.toThrow('Test error')

      await expect(
        checkpointManager.restoreCheckointFileState({ id: 1 })
      ).rejects.toThrow('Test error')

      await expect(checkpointManager.restoreUndoCheckpoint()).rejects.toThrow(
        'Test error'
      )

      await expect(checkpointManager.restoreRedoCheckpoint()).rejects.toThrow(
        'Test error'
      )

      expect(() => checkpointManager.getLatestCheckpoint()).toThrow(
        'Test error'
      )
    })
  })

  it('should correctly store and restore lastToolResults', async () => {
    const agentState = createMockAgentState()
    const specificToolResults: ToolResult[] = [
      { id: 'tool1', name: 'read_files', result: 'file content' },
      { id: 'tool2', name: 'run_terminal_command', result: 'command output' },
    ]
    const userInput = 'Input with specific tool results'

    // Add checkpoint with specific tool results
    const { checkpoint: addedCheckpoint } =
      await checkpointManager.addCheckpoint(
        agentState,
        specificToolResults,
        userInput
      )

    // Restore the checkpoint state (simulated by getting the checkpoint object)
    const retrievedCheckpoint =
      checkpointManager.checkpoints[addedCheckpoint.id - 1]

    // Verify lastToolResultsString is stored correctly
    expect(retrievedCheckpoint.lastToolResultsString).toBe(
      JSON.stringify(specificToolResults)
    )

    // Verify parsing the stored string yields the original tool results
    expect(JSON.parse(retrievedCheckpoint.lastToolResultsString)).toEqual(
      specificToolResults
    )
  })

  it('should handle adding checkpoints with different tool results', async () => {
    const agentState1 = createMockAgentState(1)
    const toolResults1: ToolResult[] = [
      { id: 't1', name: 'read_files', result: 'content1' },
    ]
    const userInput1 = 'Input 1'

    const agentState2 = createMockAgentState(2)
    const toolResults2: ToolResult[] = [
      { id: 't2', name: 'run_terminal_command', result: 'output2' },
    ]
    const userInput2 = 'Input 2'

    const { checkpoint: checkpoint1 } = await checkpointManager.addCheckpoint(
      agentState1,
      toolResults1,
      userInput1
    )
    const { checkpoint: checkpoint2 } = await checkpointManager.addCheckpoint(
      agentState2,
      toolResults2,
      userInput2
    )

    expect(checkpoint1.id).toBe(1)
    expect(JSON.parse(checkpoint1.lastToolResultsString)).toEqual(toolResults1)

    expect(checkpoint2.id).toBe(2)
    expect(JSON.parse(checkpoint2.lastToolResultsString)).toEqual(toolResults2)
    expect(checkpoint2.parentId).toBe(checkpoint1.id)
  })
})
