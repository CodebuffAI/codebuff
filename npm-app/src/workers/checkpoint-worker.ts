import { parentPort as maybeParentPort } from 'worker_threads'

import { restoreFileState, storeFileState } from '../checkpoints/file-manager'

/**
 * Message format for worker operations
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

if (maybeParentPort) {
  const parentPort = maybeParentPort

  /**
   * Handle incoming messages from the main thread.
   * Executes git operations for storing or restoring checkpoints.
   */
  parentPort.on('message', async (message: WorkerMessage) => {
    const {
      id,
      type,
      projectDir,
      bareRepoPath,
      commit,
      message: commitMessage,
      relativeFilepaths,
    } = message
    try {
      let result: string | boolean
      if (type === 'store') {
        // Store the current state as a git commit
        result = await storeFileState({
          projectDir,
          bareRepoPath,
          message: commitMessage!,
          relativeFilepaths,
        })
      } else if (type === 'restore') {
        // Restore files to a previous git commit state
        await restoreFileState({
          projectDir,
          bareRepoPath,
          commit: commit!,
          relativeFilepaths,
        })
        result = true
      } else {
        throw new Error(`Unknown operation type: ${type}`)
      }

      parentPort.postMessage({ id, success: true, result })
    } catch (error) {
      // Note: logger is not available in worker threads, so we just send the error back
      parentPort.postMessage({
        id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}
