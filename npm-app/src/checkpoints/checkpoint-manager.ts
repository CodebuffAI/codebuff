import assert from 'assert'
import os from 'os'
import { join } from 'path'
import { Worker } from 'worker_threads'

import { DEFAULT_MAX_FILES, getAllFilePaths } from 'common/project-file-tree'
import { AgentState, ToolResult } from 'common/types/agent-state'
import { blue, bold, cyan, gray, red, underline, yellow } from 'picocolors'

import { getProjectRoot } from '../project-files'
import {
  getBareRepoPath,
  getLatestCommit,
  hasUnsavedChanges,
} from './file-manager'

export class CheckpointsDisabledError extends Error {
  constructor(message?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'CheckpointsDisabledError'
  }
}

/**
 * Message format for worker thread operations
 */
interface WorkerMessage {
  /** The ID of this message */
  id: string
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
  /** The ID of the message in which this is a response to */
  id: string
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
  lastToolResultsString: string
  /** Promise resolving to the git commit hash for this checkpoint */
  fileStateIdPromise: Promise<string>
  /** Number of messages in the agent's history at checkpoint time */
  historyLength: number
  id: number
  parentId: number
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
  currentCheckpointId: number = 0
  disabledReason: string | null = null

  private bareRepoPath: string | null = null
  /** Stores the undo chain (leaf node first, current node last) */
  private undoIds: Array<number> = []
  /** Worker thread for git operations */
  private worker: Worker | null = null

  /**
   * Initialize or return the existing worker thread
   * @returns The worker thread instance
   */
  private initWorker(): Worker {
    if (!this.worker) {
      // NOTE: Uses the built workers/checkpoint-worker.js within dist.
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
   * @throws {Error} if the operation fails or times out
   */
  private async runWorkerOperation<T>(message: WorkerMessage): Promise<T> {
    const worker = this.initWorker()

    return new Promise<T>((resolve, reject) => {
      const timeoutMs = 30000 // 30 seconds timeout

      const handler = (response: WorkerResponse) => {
        if (response.id !== message.id) {
          return
        }
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
   * @param lastToolResults - The tool results from the last assistant turn
   * @param userInput - The user input that triggered this checkpoint
   * @returns The latest checkpoint and whether that checkpoint was created (or already existed)
   * @throws {Error} If the checkpoint cannot be added
   */
  async addCheckpoint(
    agentState: AgentState,
    lastToolResults: ToolResult[],
    userInput: string,
    saveWithNoChanges: boolean = false
  ): Promise<{ checkpoint: Checkpoint; created: boolean }> {
    if (this.disabledReason !== null) {
      throw new CheckpointsDisabledError(this.disabledReason)
    }

    const id = this.checkpoints.length + 1
    const projectDir = getProjectRoot()
    if (projectDir === os.homedir()) {
      this.disabledReason = 'In home directory'
      throw new CheckpointsDisabledError(this.disabledReason)
    }
    const bareRepoPath = this.getBareRepoPath()
    const relativeFilepaths = getAllFilePaths(agentState.fileContext.fileTree)

    if (relativeFilepaths.length >= DEFAULT_MAX_FILES) {
      this.disabledReason = 'Project too large'
      throw new CheckpointsDisabledError(this.disabledReason)
    }

    const needToStage =
      saveWithNoChanges ||
      (await hasUnsavedChanges({
        projectDir,
        bareRepoPath,
        relativeFilepaths,
      })) ||
      saveWithNoChanges
    if (!needToStage && this.checkpoints.length > 0) {
      return {
        checkpoint: this.checkpoints[this.checkpoints.length - 1],
        created: false,
      }
    }

    let fileStateIdPromise: Promise<string>
    if (needToStage) {
      const params = {
        type: 'store' as const,
        projectDir,
        bareRepoPath,
        message: `Checkpoint ${id}`,
        relativeFilepaths,
      }
      fileStateIdPromise = this.runWorkerOperation<string>({
        ...params,
        id: JSON.stringify(params),
      })
    } else {
      fileStateIdPromise = getLatestCommit({ bareRepoPath })
    }

    const checkpoint: Checkpoint = {
      agentStateString: JSON.stringify(agentState),
      lastToolResultsString: JSON.stringify(lastToolResults),
      fileStateIdPromise,
      historyLength: agentState.messageHistory.length,
      id,
      parentId: this.currentCheckpointId,
      timestamp: Date.now(),
      userInput,
    }

    this.checkpoints.push(checkpoint)
    this.currentCheckpointId = id
    this.undoIds = []
    return { checkpoint, created: true }
  }

  /**
   * Get the most recent checkpoint
   * @returns The most recent checkpoint or null if none exist
   * @throws {CheckpointsDisabledError} If checkpoints are disabled
   * @throws {ReferenceError} If no checkpoints exist
   */
  getLatestCheckpoint(): Checkpoint {
    if (this.disabledReason !== null) {
      throw new CheckpointsDisabledError(this.disabledReason)
    }
    if (this.checkpoints.length === 0) {
      throw new ReferenceError('No checkpoints available')
    }
    return this.checkpoints[this.checkpoints.length - 1]
  }

  /**
   * Restore the file state from a specific checkpoint
   * @param id - The ID of the checkpoint to restore
   * @param resetUndoIds - Whether to reset the chain of undo/redo ids
   * @throws {Error} If the file state cannot be restored
   */
  async restoreCheckointFileState({
    id,
    resetUndoIds = false,
  }: {
    id: number
    resetUndoIds?: boolean
  }): Promise<void> {
    if (this.disabledReason !== null) {
      throw new CheckpointsDisabledError(this.disabledReason)
    }

    const checkpoint = this.checkpoints[id - 1]
    if (!checkpoint) {
      throw new ReferenceError('No checkpoints available')
    }

    const relativeFilepaths = getAllFilePaths(
      (JSON.parse(checkpoint.agentStateString) as AgentState).fileContext
        .fileTree
    )

    const params = {
      type: 'restore' as const,
      projectDir: getProjectRoot(),
      bareRepoPath: this.getBareRepoPath(),
      commit: await checkpoint.fileStateIdPromise,
      relativeFilepaths,
    }
    await this.runWorkerOperation({ ...params, id: JSON.stringify(params) })
    this.currentCheckpointId = id
    if (resetUndoIds) {
      this.undoIds = []
    }
  }

  async restoreUndoCheckpoint(): Promise<void> {
    if (this.disabledReason !== null) {
      throw new CheckpointsDisabledError(this.disabledReason)
    }

    const currentCheckpoint = this.checkpoints[this.currentCheckpointId - 1]
    assert(
      currentCheckpoint,
      `Internal error: checkpoint #${this.currentCheckpointId} not found`
    )

    if (currentCheckpoint.parentId === 0) {
      throw new ReferenceError('Already at earliest change')
    }

    await this.restoreCheckointFileState({ id: currentCheckpoint.parentId })

    this.undoIds.push(currentCheckpoint.id)
  }

  async restoreRedoCheckpoint(): Promise<void> {
    if (this.disabledReason !== null) {
      throw new CheckpointsDisabledError(this.disabledReason)
    }

    const targetId = this.undoIds.pop()
    if (targetId === undefined) {
      throw new ReferenceError('Nothing to redo')
    }
    // Check if targetId is either 0 or undefined
    assert(
      targetId,
      `Internal error: Checkpoint ID ${targetId} found in undo list`
    )

    try {
      await this.restoreCheckointFileState({ id: targetId })
    } catch (error) {
      this.undoIds.push(targetId)
      throw new Error('Unable to restore checkpoint', { cause: error })
    }
  }

  /**
   * Clear all checkpoints
   */
  clearCheckpoints(resetBareRepoPath: boolean = false): void {
    this.checkpoints = []
    this.currentCheckpointId = 0
    this.undoIds = []
    if (resetBareRepoPath) {
      this.bareRepoPath = null
    }
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
