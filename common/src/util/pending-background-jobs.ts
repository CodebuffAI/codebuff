/**
 * Process-wide registry of running background jobs.
 *
 * Background jobs are started by the SDK's run_terminal_command(process_type: BACKGROUND).
 * The SDK registers/unregisters jobs here as they start and finish, and the
 * agent-runtime's end_turn handler reads the registry to warn agents about any
 * jobs that are still running when they try to hand control back to the user.
 *
 * Both packages depend on @codebuff/common, so this module is a stable shared
 * surface that avoids a direct agent-runtime → sdk dependency.
 */

export type PendingBackgroundJobStatus = 'running' | 'completed' | 'error'

export interface PendingBackgroundJobEntry {
  jobId: string
  command: string
  status: PendingBackgroundJobStatus
  startedAt: number
}

const pendingJobs = new Map<string, PendingBackgroundJobEntry>()

export function upsertPendingBackgroundJob(entry: PendingBackgroundJobEntry): void {
  pendingJobs.set(entry.jobId, entry)
}

/**
 * Drop a job from the registry once it has fully terminated. Logs are not
 * deleted; this only stops end_turn from warning about a completed/errored job.
 */
export function removePendingBackgroundJob(jobId: string): void {
  pendingJobs.delete(jobId)
}

export function listRunningBackgroundJobs(): PendingBackgroundJobEntry[] {
  const running: PendingBackgroundJobEntry[] = []
  for (const entry of pendingJobs.values()) {
    if (entry.status === 'running') running.push(entry)
  }
  return running
}

/** Test-only: clear the registry between tests. */
export function __clearPendingBackgroundJobsForTest(): void {
  pendingJobs.clear()
}
