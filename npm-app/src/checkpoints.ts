import { yellow, bold, underline, blue, gray, cyan } from 'picocolors'

import { AgentState } from 'common/types/agent-state'

/**
 * Interface representing a checkpoint of agent state
 */
export interface Checkpoint {
  agentStateString: string
  fileVersions: Record<string, string>
  historyLength: number
  id: number
  timestamp: number
  userInput: string
}

/**
 * Simple in-memory checkpoint manager for agent states
 */
export class CheckpointManager {
  private checkpoints: Map<number, Checkpoint> = new Map()
  private maxCheckpoints: number
  private nextId: number = 1
  private oldestId: number = 1

  constructor(maxCheckpoints: number = 100) {
    this.maxCheckpoints = maxCheckpoints
  }

  /**
   * Add a new checkpoint
   * TODO update this jsdoc and add comments to this function
   * @param agentState - The agent state to checkpoint
   * @param userInput - The user input associated with this checkpoint
   * @returns The ID of the created checkpoint
   */
  addCheckpoint(
    agentState: AgentState,
    userInput: string,
    parentId: number | null = null
  ): number {
    // Use incremental ID starting at 1
    const id = this.nextId++
    const parentFileVersions = this.getCheckpoint(parentId)?.fileVersions || {}

    const currentFileVersions = agentState.fileContext.fileVersions
      .flat()
      .reduce(
        (acc, { path, content }) => {
          acc[path] = content
          return acc
        },
        {} as Record<string, string>
      )

    const checkpoint: Checkpoint = {
      agentStateString: JSON.stringify(agentState), // Deep clone to prevent reference issues
      fileVersions: { ...parentFileVersions, ...currentFileVersions },
      historyLength: agentState.messageHistory.length,
      id,
      timestamp: Date.now(),
      userInput,
    }

    // Add to map
    this.checkpoints.set(id, checkpoint)

    // If we exceed the maximum number of checkpoints, remove the oldest one
    if (this.checkpoints.size > this.maxCheckpoints) {
      this.checkpoints.delete(this.oldestId)
      this.oldestId++
    }

    return id
  }

  /**
   * Get a checkpoint by ID
   * @param id The checkpoint ID
   * @returns The checkpoint or null if not found
   */
  getCheckpoint(id: number | null): Checkpoint | null {
    if (id === null) {
      return null
    }
    const checkpoint = this.checkpoints.get(id)
    return checkpoint || null
  }

  /**
   * Get all checkpoints
   * @returns Array of all checkpoints
   */
  getAllCheckpoints(): Checkpoint[] {
    return Array.from(this.checkpoints.values())
  }

  /**
   * Get the most recent checkpoint
   * @returns The most recent checkpoint or null if none exist
   */
  getLatestCheckpoint(): Checkpoint | null {
    return this.checkpoints.get(this.nextId - 1) || null
  }

  /**
   * Clear all checkpoints
   */
  clearCheckpoints(): void {
    this.checkpoints.clear()
    this.nextId = 1 // Reset the ID counter when clearing
    this.oldestId = 1
  }

  /**
   * Get a formatted string representation of all checkpoints
   * @param detailed Whether to include detailed information about each checkpoint
   * @returns A formatted string representation of all checkpoints
   */
  getCheckpointsAsString(detailed: boolean = false): string {
    const checkpoints = this.getAllCheckpoints().sort((a, b) => a.id - b.id)

    if (checkpoints.length === 0) {
      return yellow('No checkpoints available.')
    }

    const lines: string[] = [bold(underline('Agent State Checkpoints:')), '']

    checkpoints.forEach((checkpoint) => {
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
    const checkpoint = this.getCheckpoint(id)
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
