import { ChildProcessByStdio } from 'child_process'
import { Readable } from 'stream'

/**
 * Interface describing the information stored for each background process.
 */
export interface BackgroundProcessInfo {
  // OS-assigned Process ID
  id: number
  command: string
  // The actual child process object
  process: ChildProcessByStdio<null, Readable, Readable>
  // Buffer to store stdout chunks
  stdoutBuffer: string[]
  // Buffer to store stderr chunks
  stderrBuffer: string[]
  // Current status of the process
  status: 'running' | 'completed' | 'error'
  // Exit code if the process has completed or errored after starting
  exitCode: number | null
  // Timestamp when the process was started
  startTime: number
  // Timestamp when the process ended (completed or errored)
  endTime: number | null
}

/**
 * Global map storing information about active and completed background processes.
 * Keyed by the OS-assigned Process ID (PID).
 */
export const backgroundProcesses = new Map<number, BackgroundProcessInfo>()
