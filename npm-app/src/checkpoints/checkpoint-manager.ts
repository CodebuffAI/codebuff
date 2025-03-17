import { join } from 'path'
import { blue, bold, cyan, gray, red, underline, yellow } from 'picocolors'
import { Worker } from 'worker_threads'

import { getAllFilePaths, DEFAULT_MAX_FILES } from 'common/project-file-tree'
import { AgentState } from 'common/types/agent-state'
import {
  getBareRepoPath,
  hasUnsavedChanges,
  getLatestCommit,
} from './file-manager'
import { getProjectRoot } from '../project-files'

/**
 * Message format for worker thread operations
 */
interface WorkerMessage {
  /** Operation type - either storing or restoring checkpoint state */
  type: 'store' | 'restore'
  projectDir: string
  bareRepoPath: string
  relativeFilepaths: string[]

  /** Git commit hash for restore operations */
  commit?: string
  /** Commit message for store operations */
  message?: string
}

/**
 * Response format from worker thread operations
 */
interface WorkerResponse {
  /** Whether the operation succeeded */
  success: boolean
  /** Operation result - commit hash for store operations */
  result?: unknown
  /** Error message if operation failed */
  error?: string
}

/**
 * Interface representing a checkpoint of agent state
 */
export interface Checkpoint {
  agentStateString: string
  /** Promise resolving to the git commit hash for this checkpoint */
  fileStateIdPromise: Promise<string>
  /** Number of messages in the agent's history at checkpoint time */
  historyLength: number
  id: number
  timestamp: number
  /** User input that triggered this checkpoint */
  userInput: string
}

/**
 * Manages checkpoints of agent state and file state using git operations in a worker thread.
 * Each checkpoint contains both the agent's conversation state and a git commit
 * representing the state of all tracked files at that point.
 */
export class CheckpointManager {
  checkpoints: Array<Checkpoint> = []
  private bareRepoPath: string | null = null
  disabledReason: string | null = null
  /** Worker thread for git operations */
  private worker: Worker | null = null

  /**
   * Initialize or return the existing worker thread
   * @returns The worker thread instance
   */
  private initWorker(): Worker {
    if (!this.worker) {
      // NOTE: Uses the built worker-script-project-context.js within dist.
      // So you need to run `bun run build` before running locally.
      const workerPath = __filename.endsWith('.ts')
        ? join(__dirname, '../../dist', 'workers/checkpoint-worker.js')
        : join(__dirname, '../workers/checkpoint-worker.js')
      this.worker = new Worker(workerPath)
    }
    return this.worker
  }

  /**
   * Execute an operation in the worker thread with timeout handling
   * @param message - The message describing the operation to perform
   * @returns A promise that resolves with the operation result
   * @throws Error if the operation fails or times out
   */
  private async runWorkerOperation<T>(message: WorkerMessage): Promise<T> {
    const worker = this.initWorker()

    return new Promise<T>((resolve, reject) => {
      const timeoutMs = 30000 // 30 seconds timeout

      const handler = (response: WorkerResponse) => {
        if (response.success) {
          resolve(response.result as T)
        } else {
          reject(new Error(response.error))
        }
        worker.off('message', handler)
      }

      worker.on('message', handler)
      worker.postMessage(message)

      // Add timeout
      setTimeout(() => {
        worker.off('message', handler)
        reject(new Error('Worker operation timed out'))
      }, timeoutMs)
    })
  }

  /**
   * Get the path to the bare git repository used for storing file states
   * @returns The bare repo path
   */
  private getBareRepoPath(): string {
    if (!this.bareRepoPath) {
      this.bareRepoPath = getBareRepoPath(getProjectRoot())
    }
    return this.bareRepoPath
  }

  /**
   * Add a new checkpoint of the current agent and file state
   * @param agentState - The current agent state to checkpoint
   * @param userInput - The user input that triggered this checkpoint
   * @returns The created checkpoint, or null if checkpointing is disabled
   */
  async addCheckpoint(
    agentState: AgentState,
    userInput: string
  ): Promise<Checkpoint | null> {
    if (this.disabledReason !== null) {
      return null
    }

    const id = this.checkpoints.length + 1
    const projectDir = getProjectRoot()
    const bareRepoPath = this.getBareRepoPath()
    const relativeFilepaths = getAllFilePaths(agentState.fileContext.fileTree)

    if (relativeFilepaths.length >= DEFAULT_MAX_FILES) {
      this.disabledReason = 'Project too large'
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
      ? this.runWorkerOperation<string>({
          type: 'store',
          projectDir,
          bareRepoPath,
          message: `Checkpoint ${id}`,
          relativeFilepaths,
        })
      : getLatestCommit({ bareRepoPath })

    const checkpoint: Checkpoint = {
      agentStateString: JSON.stringify(agentState),
      fileStateIdPromise,
      historyLength: agentState.messageHistory.length,
      id,
      timestamp: Date.now(),
      userInput,
    }

    this.checkpoints.push(checkpoint)
    return checkpoint
  }

  /**
   * Get the most recent checkpoint
   * @returns The most recent checkpoint or null if none exist
   */
  getLatestCheckpoint(): Checkpoint | null {
    if (this.disabledReason !== null) {
      return null
    }
    return this.checkpoints.length === 0
      ? null
      : this.checkpoints[this.checkpoints.length - 1]
  }

  /**
   * Restore the file state from a specific checkpoint
   * @param id - The ID of the checkpoint to restore
   * @returns True if restoration succeeded, false if checkpoint not found
   */
  async restoreCheckointFileState(id: number): Promise<boolean> {
    const checkpoint = this.checkpoints[id - 1]
    if (!checkpoint) {
      return false
    }

    const relativeFilepaths = getAllFilePaths(
      (JSON.parse(checkpoint.agentStateString) as AgentState).fileContext
        .fileTree
    )

    await this.runWorkerOperation({
      type: 'restore',
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
    if (this.disabledReason !== null) {
      return red(`Checkpoints not enabled: ${this.disabledReason}`)
    }

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
        const messageCount = checkpoint.historyLength
        lines.push(`  ${blue('Messages')}: ${messageCount}`)
      }

      lines.push('') // Empty line between checkpoints
    })

    return lines.join('\n')
  }
}

// Export a singleton instance for use throughout the application
export const checkpointManager = new CheckpointManager()
