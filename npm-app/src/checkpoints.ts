import { AgentState } from 'common/types/agent-state'
import {
  yellow,
  red,
  green,
  bold,
  underline,
  blueBright,
  blue,
  gray,
  cyan,
} from 'picocolors'

/**
 * Interface representing a checkpoint of agent state
 */
export interface Checkpoint {
  id: number
  timestamp: number
  userInput: string
  agentState: AgentState
}

/**
 * Simple in-memory checkpoint manager for agent states
 */
export class CheckpointManager {
  private checkpoints: Map<number, Checkpoint> = new Map()
  private maxCheckpoints: number
  private nextId: number = 1

  constructor(maxCheckpoints: number = 100) {
    this.maxCheckpoints = maxCheckpoints
  }

  /**
   * Add a new checkpoint
   * @param agentState - The agent state to checkpoint
   * @param userInput - The user input associated with this checkpoint
   * @returns The ID of the created checkpoint
   */
  addCheckpoint(agentState: AgentState, userInput: string): number {
    // Use incremental ID starting at 1
    const id = this.nextId++

    const checkpoint: Checkpoint = {
      id,
      timestamp: Date.now(),
      userInput,
      agentState: JSON.parse(JSON.stringify(agentState)), // Deep clone to prevent reference issues
    }

    // Add to map
    this.checkpoints.set(id, checkpoint)

    // If we exceed the maximum number of checkpoints, remove the oldest one
    if (this.checkpoints.size > this.maxCheckpoints) {
      const oldestKey = this.getOldestCheckpointId()
      if (oldestKey !== undefined) {
        this.checkpoints.delete(oldestKey)
      }
    }

    return id
  }

  /**
   * Get a checkpoint by ID
   * @param id The checkpoint ID
   * @returns The checkpoint or null if not found
   */
  getCheckpoint(id: number): Checkpoint | null {
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
    if (this.checkpoints.size === 0) {
      return null
    }

    return this.getAllCheckpoints().sort((a, b) => b.timestamp - a.timestamp)[0]
  }

  /**
   * Clear all checkpoints
   */
  clearCheckpoints(): void {
    this.checkpoints.clear()
    this.nextId = 1 // Reset the ID counter when clearing
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
      const userInput = userInputOneLine.length > 50
          ? userInputOneLine.substring(0, 47) + '...'
          : userInputOneLine

      lines.push(
        `${cyan(bold(`#${checkpoint.id}`))} ${gray(`[${formattedDate}]`)}:`
      )

      lines.push(`  ${blue('Input')}: ${userInput}`)

      if (detailed) {
        // Add more details about the agent state if needed
        const messageCount = checkpoint.agentState.messageHistory.length
        lines.push(`  ${blue('Messages')}: ${messageCount}`)

        // You can add more detailed information here as needed
        // For example, file context information, etc.
      }

      lines.push('') // Empty line between checkpoints
    })

    return lines.join('\n')
  }

  /**
   * Get the ID of the oldest checkpoint
   * @returns The ID of the oldest checkpoint or undefined if none exist
   */
  private getOldestCheckpointId(): number | undefined {
    if (this.checkpoints.size === 0) {
      return undefined
    }

    const oldest = this.getAllCheckpoints().sort(
      (a, b) => a.timestamp - b.timestamp
    )[0]

    return oldest.id
  }
}

// Export a singleton instance for use throughout the application
export const checkpointManager = new CheckpointManager()
