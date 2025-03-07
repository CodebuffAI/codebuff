import { describe, it, expect, beforeEach } from 'jest'
import { CheckpointManager, Checkpoint } from '../checkpoints'
import { AgentState, getInitialAgentState } from 'common/types/agent-state'
import { ProjectFileContext } from 'common/util/file'

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
  prevFileVersions: {},
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
    checkpointManager = new CheckpointManager(5) // Limit to 5 checkpoints for testing
  })
  
  it('should add a checkpoint and return its ID', () => {
    const agentState = createMockAgentState()
    const userInput = 'Test user input'
    
    const id = checkpointManager.addCheckpoint(agentState, userInput)
    
    expect(id).toBe(1) // First checkpoint should have ID 1
    
    const checkpoint = checkpointManager.getCheckpoint(id)
    expect(checkpoint).not.toBeNull()
    expect(checkpoint?.userInput).toBe(userInput)
    expect(checkpoint?.historyLength).toBe(agentState.messageHistory.length)
  })
  
  it('should retrieve a checkpoint by ID', () => {
    const agentState = createMockAgentState()
    const id = checkpointManager.addCheckpoint(agentState, 'Test input')
    
    const checkpoint = checkpointManager.getCheckpoint(id)
    
    expect(checkpoint).not.toBeNull()
    expect(checkpoint?.id).toBe(id)
    expect(JSON.parse(checkpoint!.agentStateString)).toEqual(agentState)
  })
  
  it('should return null when getting a non-existent checkpoint', () => {
    const checkpoint = checkpointManager.getCheckpoint(999)
    
    expect(checkpoint).toBeNull()
  })
  
  it('should get all checkpoints', () => {
    checkpointManager.addCheckpoint(createMockAgentState(1), 'Input 1')
    checkpointManager.addCheckpoint(createMockAgentState(2), 'Input 2')
    checkpointManager.addCheckpoint(createMockAgentState(3), 'Input 3')
    
    const checkpoints = checkpointManager.getAllCheckpoints()
    
    expect(checkpoints.length).toBe(3)
    expect(checkpoints[0].id).toBe(1)
    expect(checkpoints[1].id).toBe(2)
    expect(checkpoints[2].id).toBe(3)
  })
  
  it('should get the latest checkpoint', () => {
    // We need to modify the implementation for testing to control timestamps
    // Create a subclass of CheckpointManager that allows us to manipulate timestamps
    class TestCheckpointManager extends CheckpointManager {
      // Method to directly manipulate a checkpoint's timestamp
      setCheckpointTimestamp(id: number, timestamp: number): void {
        const checkpoint = this.getCheckpoint(id);
        if (checkpoint) {
          checkpoint.timestamp = timestamp;
        }
      }
    }
    
    const testManager = new TestCheckpointManager(5);
    
    // Add checkpoints
    const id1 = testManager.addCheckpoint(createMockAgentState(1), 'Input 1');
    const id2 = testManager.addCheckpoint(createMockAgentState(2), 'Input 2');
    
    // Set id1 to have the most recent timestamp
    const now = Date.now();
    testManager.setCheckpointTimestamp(id1, now);
    testManager.setCheckpointTimestamp(id2, now - 1000); // 1 second earlier
    
    const latestCheckpoint = testManager.getLatestCheckpoint();
    
    expect(latestCheckpoint).not.toBeNull();
    // The latest checkpoint should be the one with the most recent timestamp (id1)
    expect(latestCheckpoint?.id).toBe(id1);
  })
  
  it('should return null for latest checkpoint when no checkpoints exist', () => {
    const latestCheckpoint = checkpointManager.getLatestCheckpoint()
    
    expect(latestCheckpoint).toBeNull()
  })
  
  it('should clear all checkpoints', () => {
    checkpointManager.addCheckpoint(createMockAgentState(), 'Input 1')
    checkpointManager.addCheckpoint(createMockAgentState(), 'Input 2')
    
    checkpointManager.clearCheckpoints()
    
    expect(checkpointManager.getAllCheckpoints().length).toBe(0)
    expect(checkpointManager.getLatestCheckpoint()).toBeNull()
  })
  
  it('should enforce the maximum number of checkpoints', () => {
    // Add more checkpoints than the limit (5)
    for (let i = 0; i < 7; i++) {
      checkpointManager.addCheckpoint(createMockAgentState(), `Input ${i}`)
    }
    
    const checkpoints = checkpointManager.getAllCheckpoints()
    
    // Should only keep the 5 most recent checkpoints
    expect(checkpoints.length).toBe(5)
    expect(checkpoints[0].id).toBe(3) // Oldest checkpoint should be ID 3
    expect(checkpoints[4].id).toBe(7) // Newest checkpoint should be ID 7
  })
  
  it('should format checkpoints as a string', () => {
    checkpointManager.addCheckpoint(createMockAgentState(), 'Test input')
    
    const formatted = checkpointManager.getCheckpointsAsString()
    
    expect(formatted).toContain('Agent State Checkpoints')
    expect(formatted).toContain('#1')
    expect(formatted).toContain('Test input')
  })
  
  it('should format detailed checkpoint information', () => {
    const id = checkpointManager.addCheckpoint(createMockAgentState(3), 'Detailed test')
    
    const details = checkpointManager.getCheckpointDetails(id)
    
    expect(details).toContain(`checkpoint #${id}`)
    expect(details).toContain('Detailed test')
    expect(details).toContain('3 messages') // We created an agent state with 3 messages
  })
  
  it('should return an error message for non-existent checkpoint details', () => {
    const details = checkpointManager.getCheckpointDetails(999)
    
    expect(details).toContain('not found')
  })
  
  it('should reset the ID counter when clearing checkpoints', () => {
    checkpointManager.addCheckpoint(createMockAgentState(), 'First batch')
    checkpointManager.clearCheckpoints()
    const newId = checkpointManager.addCheckpoint(createMockAgentState(), 'Second batch')
    
    expect(newId).toBe(1) // ID counter should reset to 1
  })
})
