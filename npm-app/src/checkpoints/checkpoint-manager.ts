import { blue, bold, cyan, gray, underline, yellow } from 'picocolors'

import { getAllFilePaths, DEFAULT_MAX_FILES } from 'common/project-file-tree'
import { AgentState } from 'common/types/agent-state'
import {
  getBareRepoPath,
  storeFileState,
  restoreFileState,
  hasUnsavedChanges,
  getLatestCommit,
} from './file-manager'
import { getProjectRoot } from '../project-files'

/**
 * Interface representing a checkpoint of agent state
 */
export interface Checkpoint {
  agentStateString: string
  fileStateIdPromise: Promise<string>
  historyLength: number
  id: number
  timestamp: number
  userInput: string
}

/**
 * Simple in-memory checkpoint manager for agent states
 */
export class CheckpointManager {
  checkpoints: Array<Checkpoint> = []
  private bareRepoPath: string | null = null
  enabled: boolean = true

  getBareRepoPath(): string {
    if (!this.bareRepoPath) {
      this.bareRepoPath = getBareRepoPath(getProjectRoot())
    }
    return this.bareRepoPath
  }

  /**
   * Add a new checkpoint
   * @param agentState - The agent state to checkpoint
   * @param userInput - The user input associated with this checkpoint
   * @returns The ID of the created checkpoint
   */
  async addCheckpoint(
    agentState: AgentState,
    userInput: string
  ): Promise<Checkpoint | null> {
    if (!this.enabled) {
      return null
    }
    // Use incremental ID starting at 1
    const id = this.checkpoints.length + 1

    const projectDir = getProjectRoot()
    const bareRepoPath = this.getBareRepoPath()
    const relativeFilepaths = getAllFilePaths(agentState.fileContext.fileTree)

    if (relativeFilepaths.length >= DEFAULT_MAX_FILES) {
      this.enabled = false
      return null
    }

    const needToStage = await hasUnsavedChanges({
      projectDir,
      bareRepoPath,
      relativeFilepaths,
    })
    if (!needToStage && this.checkpoints.length > 0) {
      return null
    }

    const fileStateIdPromise = needToStage
      ? storeFileState({
          projectDir,
          bareRepoPath,
          message: `Checkpoint ${id}`,
          relativeFilepaths,
        })
      : getLatestCommit({ bareRepoPath })

    const checkpoint: Checkpoint = {
      agentStateString: JSON.stringify(agentState), // Deep clone to prevent reference issues
      fileStateIdPromise,
      historyLength: agentState.messageHistory.length,
      id,
      timestamp: Date.now(),
      userInput,
    }

    // Add to map
    this.checkpoints.push(checkpoint)

    return checkpoint
  }

  /**
   * Get the most recent checkpoint
   * @returns The most recent checkpoint or null if none exist
   */
  getLatestCheckpoint(): Checkpoint | null {
    return this.checkpoints.length === 0
      ? null
      : this.checkpoints[this.checkpoints.length - 1]
  }

  async restoreCheckointFileState(id: number): Promise<boolean> {
    const checkpoint = this.checkpoints[id - 1]
    if (!checkpoint) {
      return false
    }

    const relativeFilepaths = getAllFilePaths(
      (JSON.parse(checkpoint.agentStateString) as AgentState).fileContext
        .fileTree
    )

    await restoreFileState({
      projectDir: getProjectRoot(),
      bareRepoPath: this.getBareRepoPath(),
      commit: await checkpoint.fileStateIdPromise,
      relativeFilepaths,
    })
    return true
  }

  /**
   * Clear all checkpoints
   */
  clearCheckpoints(): void {
    this.checkpoints = []
  }

  /**
   * Get a formatted string representation of all checkpoints
   * @param detailed Whether to include detailed information about each checkpoint
   * @returns A formatted string representation of all checkpoints
   */
  getCheckpointsAsString(detailed: boolean = false): string {
    if (this.checkpoints.length === 0) {
      return yellow('No checkpoints available.')
    }

    const lines: string[] = [bold(underline('Agent State Checkpoints:')), '']

    this.checkpoints.forEach((checkpoint) => {
      const date = new Date(checkpoint.timestamp)
      const formattedDate = date.toLocaleString()

      const userInputOneLine = checkpoint.userInput.replaceAll('\n', ' ')
      const userInput =
        userInputOneLine.length > 50
          ? userInputOneLine.substring(0, 47) + '...'
          : userInputOneLine

      lines.push(
        `${cyan(bold(`#${checkpoint.id}`))} ${gray(`[${formattedDate}]`)}:`
      )

      lines.push(`  ${blue('Input')}: ${userInput}`)

      if (detailed) {
        // Add more details about the agent state if needed
        const messageCount = checkpoint.historyLength
        lines.push(`  ${blue('Messages')}: ${messageCount}`)

        // You can add more detailed information here as needed
        // For example, file context information, etc.
      }

      lines.push('') // Empty line between checkpoints
    })

    return lines.join('\n')
  }

  /**
   * Get detailed information about a specific checkpoint
   * @param id The checkpoint ID
   * @returns A formatted string with detailed information about the checkpoint, or an error message if not found
   */
  getCheckpointDetails(id: number): string {
    const checkpoint = this.checkpoints[id - 1]
    if (!checkpoint) {
      return cyan(`\nCheckpoint #${id} not found.`)
    }

    const lines: string[] = [
      cyan(`Detailed information for checkpoint #${id}:`),
    ]

    const date = new Date(checkpoint.timestamp)
    const formattedDate = date.toLocaleString()
    lines.push(`${blue('Created at')}: ${formattedDate}`)

    if (checkpoint.userInput) {
      lines.push(`${blue('User input')}: ${checkpoint.userInput}`)
    }

    // Display more detailed information about the agent state
    const messageCount = checkpoint.historyLength
    lines.push(`${blue('Message history')}: ${messageCount} messages`)

    // You could add more detailed information here as needed

    return lines.join('\n')
  }
}

// Export a singleton instance for use throughout the application
export const checkpointManager = new CheckpointManager()
