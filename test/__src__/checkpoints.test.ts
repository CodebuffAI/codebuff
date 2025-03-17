import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { CheckpointManager } from '../../npm-app/src/checkpoints/checkpoint-manager'
import { AgentState, getInitialAgentState } from 'common/types/agent-state'
import { ProjectFileContext } from 'common/util/file'

// Mock isomorphic-git to prevent actual file system operations
beforeEach(() => {
  // Mock fs module at the lowest level
  const mockFs = {
    default: {
      mkdirSync: (path: string, options: any) => {
        // Return undefined to indicate success without actually creating directories
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

  // Mock all fs module variants
  mock.module('fs', () => mockFs.default)
  mock.module('node:fs', () => mockFs.default)
  mock.module('node:fs/promises', () => mockFs.default.promises)
  mock.module('fs/promises', () => mockFs.default.promises)

  // Mock git operations
  mock.module('isomorphic-git', () => ({
    statusMatrix: () => [],
    add: () => {},
    commit: () => 'mock-commit',
    writeRef: () => {},
    resolveRef: () => 'HEAD',
    init: () => {},
    checkout: () => {},
    resetIndex: () => {},
  }))

  // Mock crypto
  mock.module('crypto', () => ({
    createHash: () => ({
      update: () => ({
        digest: () => 'mock-hash',
      }),
    }),
  }))

  // Mock child_process
  mock.module('child_process', () => ({
    execFileSync: () => Buffer.from(''),
  }))

  // Mock project files
  mock.module('../../npm-app/src/project-files', () => ({
    getProjectRoot: () => '/test/project',
    getProjectDataDir: () => '/test/data',
  }))

  // Mock file-manager module itself to override fs
  mock.module('../../npm-app/src/checkpoints/file-manager', () => ({
    ...require('../../npm-app/src/checkpoints/file-manager'),
    fs: mockFs.default,
    hasUnsavedChanges: () => Promise.resolve(true),
  }))
})

// Mock minimal ProjectFileContext for testing
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

// Create a mock agent state for testing
function createMockAgentState(messageCount: number = 1): AgentState {
  const agentState = getInitialAgentState(mockFileContext)

  // Add some test messages
  for (let i = 0; i < messageCount; i++) {
    agentState.messageHistory.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Test message ${i}`,
    })
  }

  return agentState
}

describe('CheckpointManager', () => {
  let checkpointManager: CheckpointManager

  beforeEach(() => {
    // Create a fresh checkpoint manager before each test
    checkpointManager = new CheckpointManager()
  })

  it('should add a checkpoint and return its ID', async () => {
    const agentState = createMockAgentState()
    const userInput = 'Test user input'

    const checkpoint = await checkpointManager.addCheckpoint(
      agentState,
      userInput
    )

    expect(checkpoint).not.toBeNull()
    expect(checkpoint?.userInput).toBe(userInput)
    expect(checkpoint?.historyLength).toBe(agentState.messageHistory.length)
  })

  it('should retrieve a checkpoint by ID', async () => {
    const agentState = createMockAgentState()
    const checkpoint = await checkpointManager.addCheckpoint(
      agentState,
      'Test input'
    )

    expect(checkpoint).not.toBeNull()
    expect(checkpoint?.id).toBe(1)
    expect(JSON.parse(checkpoint!.agentStateString)).toEqual(agentState)
  })

  it('should return null when getting a non-existent checkpoint', () => {
    const checkpoint = checkpointManager.getLatestCheckpoint()
    expect(checkpoint).toBeNull()
  })

  it('should get all checkpoints', async () => {
    // Mock hasUnsavedChanges to return true so checkpoints are created
    mock.module('../../npm-app/src/checkpoints/file-manager', () => ({
      ...require('../../npm-app/src/checkpoints/file-manager'),
      hasUnsavedChanges: () => Promise.resolve(true),
    }))

    const checkpoint1 = await checkpointManager.addCheckpoint(
      createMockAgentState(1),
      'Input 1'
    )
    const checkpoint2 = await checkpointManager.addCheckpoint(
      createMockAgentState(2),
      'Input 2'
    )
    const checkpoint3 = await checkpointManager.addCheckpoint(
      createMockAgentState(3),
      'Input 3'
    )

    expect(checkpoint1).not.toBeNull()
    expect(checkpoint2).not.toBeNull()
    expect(checkpoint3).not.toBeNull()

    const checkpoints = checkpointManager.checkpoints
    expect(checkpoints.length).toBe(3)
    expect(checkpoints[0].id).toBe(1)
    expect(checkpoints[1].id).toBe(2)
    expect(checkpoints[2].id).toBe(3)
  })

  it('should get the latest checkpoint', async () => {
    // Add checkpoints
    await checkpointManager.addCheckpoint(createMockAgentState(1), 'Input 1')
    const checkpoint2 = await checkpointManager.addCheckpoint(
      createMockAgentState(2),
      'Input 2'
    )

    const latestCheckpoint = checkpointManager.getLatestCheckpoint()

    expect(latestCheckpoint).not.toBeNull()
    // The latest checkpoint should be the one with the highest ID
    expect(latestCheckpoint?.id).toBe(checkpoint2?.id)
  })

  it('should return null for latest checkpoint when no checkpoints exist', () => {
    const latestCheckpoint = checkpointManager.getLatestCheckpoint()
    expect(latestCheckpoint).toBeNull()
  })

  it('should clear all checkpoints', async () => {
    await checkpointManager.addCheckpoint(createMockAgentState(), 'Input 1')
    await checkpointManager.addCheckpoint(createMockAgentState(), 'Input 2')

    checkpointManager.clearCheckpoints()

    expect(checkpointManager.checkpoints.length).toBe(0)
    expect(checkpointManager.getLatestCheckpoint()).toBeNull()
  })

  it('should maintain all checkpoints', async () => {
    // Add more checkpoints than the limit (5)
    for (let i = 0; i < 7; i++) {
      await checkpointManager.addCheckpoint(
        createMockAgentState(),
        `Input ${i}`
      )
    }

    const checkpoints = checkpointManager.checkpoints

    // Should keep all checkpoints
    expect(checkpoints.length).toBe(7)
    expect(checkpoints[0].id).toBe(1) // First checkpoint should be ID 1
    expect(checkpoints[6].id).toBe(7) // Last checkpoint should be ID 7
  })

  it('should format checkpoints as a string', async () => {
    await checkpointManager.addCheckpoint(createMockAgentState(), 'Test input')

    const formatted = checkpointManager.getCheckpointsAsString()

    expect(formatted).toContain('Agent State Checkpoints')
    expect(formatted).toContain('#1')
    expect(formatted).toContain('Test input')
  })

  it('should format detailed checkpoint information', async () => {
    const checkpoint = await checkpointManager.addCheckpoint(
      createMockAgentState(3),
      'Detailed test'
    )

    const details = checkpointManager.getCheckpointsAsString(true)

    expect(details).toContain(`#${checkpoint!.id}`)
    expect(details).toContain('Detailed test')
    expect(details).toContain('\u001b[34mMessages\u001b[39m: 3') // Match exact format including ANSI color codes
  })

  it('should return error message when checkpoints are disabled', () => {
    checkpointManager.disabledReason = 'Project too large'
    const details = checkpointManager.getCheckpointsAsString()
    expect(details).toContain('Checkpoints not enabled: Project too large')
  })

  it('should reset the ID counter when clearing checkpoints', async () => {
    await checkpointManager.addCheckpoint(createMockAgentState(), 'First batch')
    checkpointManager.clearCheckpoints()
    const checkpoint = await checkpointManager.addCheckpoint(
      createMockAgentState(),
      'Second batch'
    )

    expect(checkpoint?.id).toBe(1) // ID counter should reset to 1
  })
})
