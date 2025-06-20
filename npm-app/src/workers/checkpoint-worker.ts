import { parentPort as maybeParentPort } from 'worker_threads'
import { restoreFileState, storeFileState } from '../checkpoints/file-manager'
import { setProjectRoot } from '../project-files'

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

  console.log('[CHECKPOINT WORKER] Worker thread started')

  /**
   * Handle incoming messages from the main thread.
   * Executes git operations for storing or restoring checkpoints.
   */
  parentPort.on('message', async (message: WorkerMessage) => {
    console.log('[CHECKPOINT WORKER] Received message:', message.type, 'ID:', message.id)
    console.log('[CHECKPOINT WORKER] Project dir:', message.projectDir)
    console.log('[CHECKPOINT WORKER] Bare repo path:', message.bareRepoPath)
    console.log('[CHECKPOINT WORKER] Files to process:', message.relativeFilepaths.length)
    
    const {
      id,
      type,
      projectDir,
      bareRepoPath,
      commit,
      message: commitMessage,
      relativeFilepaths,
    } = message
    
    setProjectRoot(projectDir)
    
    try {
      let result: string | boolean
      if (type === 'store') {
        console.log('[CHECKPOINT WORKER] Storing file state with message:', commitMessage)
        // Store the current state as a git commit
        result = await storeFileState({
          projectDir,
          bareRepoPath,
          message: commitMessage!,
          relativeFilepaths,
        })
        console.log('[CHECKPOINT WORKER] Store operation completed, commit hash:', result)
      } else if (type === 'restore') {
        console.log('[CHECKPOINT WORKER] Restoring file state to commit:', commit)
        // Restore files to a previous git commit state
        await restoreFileState({
          projectDir,
          bareRepoPath,
          commit: commit!,
          relativeFilepaths,
        })
        result = true
        console.log('[CHECKPOINT WORKER] Restore operation completed successfully')
      } else {
        console.log('[CHECKPOINT WORKER] Unknown operation type:', type)
        throw new Error(`Unknown operation type: ${type}`)
      }

      console.log('[CHECKPOINT WORKER] Sending success response for ID:', id)
      parentPort.postMessage({ id, success: true, result })
    } catch (error) {
      console.log('[CHECKPOINT WORKER] Operation failed for ID:', id, 'Error:', error instanceof Error ? error.message : String(error))
      // Note: logger is not available in worker threads, so we just send the error back
      parentPort.postMessage({
        id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })
}
