/**
 * In-memory registry for background agent turns.
 *
 * A "background agent turn" is a {@link loopAgentSteps} invocation launched
 * detached from the main run via `spawn_agents({ background: true })`. The
 * parent's `handleSpawnAgents` returns immediately with a `jobId`; the agent
 * step loop runs as an un-awaited same-process coroutine whose progress the
 * parent (or another agent) can poll via `check_background_agent`.
 *
 * This module mirrors the shell-process registry in
 * `sdk/src/tools/background-jobs.ts` (Map + lifecycle + test hooks) but
 * tracks a detached agent coroutine instead of a `ChildProcess`. Key
 * differences from shell background jobs:
 *
 * - No `logFile`/`metadataFile` on disk: the agent streams structured chunks
 *   (text, tool_call, tool_result, subagent_* events) into an in-memory ring
 *   buffer rather than raw stdout/stderr bytes. The buffer is bounded to
 *   prevent unbounded memory growth on long-running agents.
 * - No process recovery across CLI sessions: because the agent coroutine is
 *   an in-process JS generator, it cannot outlive the host process. A crashed
 *   CLI loses in-flight background agent turns (their partial state is
 *   preserved only via the mid-turn checkpoint in {@link loopAgentSteps}).
 * - Completion is signaled by the underlying promise settling, not a child
 *   `exit` event.
 *
 * The registry is session-scoped: it persists across tool calls within a
 * single CLI session and is cleared on `__clearBackgroundAgentJobsForTest`.
 */

/**
 * Bounded ring buffer for streaming agent output. Older chunks are evicted
 * once the buffer exceeds this many entries to bound memory on long agents.
 */
const MAX_BUFFERED_CHUNKS = 200

/**
 * A single streamed chunk from a background agent turn. Mirrors the
 * `PrintModeEvent` shape but is kept minimal to avoid coupling the registry
 * to the full event union. The `text` field carries assistant text; `type`
 * preserves the original event type for the polling caller to interpret.
 */
export interface BackgroundAgentChunk {
  /** Original event type (e.g. 'text', 'tool_call', 'tool_result'). */
  type: string
  /** Serialized chunk payload (opaque to the registry). */
  payload: unknown
  /** Wall-clock timestamp when the chunk was appended. */
  timestamp: number
}

export type BackgroundAgentJobStatus = 'running' | 'completed' | 'error'

export interface BackgroundAgentJob {
  jobId: string
  /** Agent type string (e.g. 'basher', 'code-searcher'). */
  agentType: string
  /** Agent template display name. */
  agentName: string
  status: BackgroundAgentJobStatus
  startedAt: number
  /** Resolved value when status === 'completed'; undefined otherwise. */
  result?: unknown
  /** Rejection reason when status === 'error'; undefined otherwise. */
  error?: string
  /** Ring buffer of streamed chunks, oldest-first, bounded. */
  chunks: BackgroundAgentChunk[]
  /**
   * Number of chunks already consumed by a `check_background_agent` poll.
   * Polls return only the chunks appended since the last poll.
   */
  readOffset: number
  /** The detached coroutine promise. Stored for lifecycle bookkeeping only. */
  promise: Promise<unknown>
}

const jobs = new Map<string, BackgroundAgentJob>()
let jobCounter = 0

/**
 * Generate a unique, human-readable job id. Mirrors the shell-job id format
 * but is namespaced `bg-agent-` to distinguish it from `job-` shell jobs.
 */
function nextJobId(): string {
  jobCounter += 1
  return `bg-agent-${process.pid}-${jobCounter}`
}

/**
 * Allocate a job id and a pending job record WITHOUT a coroutine promise yet.
 * This split is required because {@link executeSubagent} synchronously fires
 * `onResponseChunk(startEvent)` when invoked — the chunk handler needs a
 * `jobId` to buffer into BEFORE the detached promise exists. The caller must
 * invoke {@link attachBackgroundAgentPromise} immediately after launching the
 * coroutine to wire the settle handlers that transition the status.
 */
export function allocateBackgroundAgentJob(params: {
  agentType: string
  agentName: string
}): BackgroundAgentJob {
  const { agentType, agentName } = params
  const jobId = nextJobId()
  const job: BackgroundAgentJob = {
    jobId,
    agentType,
    agentName,
    status: 'running',
    startedAt: Date.now(),
    chunks: [],
    readOffset: 0,
    // Placeholder promise replaced by {@link attachBackgroundAgentPromise}.
    promise: Promise.resolve(),
  }
  jobs.set(jobId, job)
  return job
}

/**
 * Attach a detached coroutine promise to a job allocated by
 * {@link allocateBackgroundAgentJob} and wire the settle handlers that
 * transition the status to 'completed' or 'error'. MUST be called immediately
 * after launching the coroutine; the job is not usable for status polling
 * until this is wired.
 */
export function attachBackgroundAgentPromise(
  job: BackgroundAgentJob,
  promise: Promise<unknown>,
): void {
  job.promise = promise
  attachJobCompletionHandlers(job)
}

/**
 * Register a new background agent job with an already-created coroutine
 * promise. Convenience wrapper for callers that do NOT need to buffer chunks
 * before the promise exists (i.e. when the coroutine defers its first
 * `onResponseChunk` to a later tick). Callers that need to pre-allocate the
 * jobId (because the coroutine fires synchronously, as `executeSubagent` does)
 * should use {@link allocateBackgroundAgentJob} + {@link attachBackgroundAgentPromise}.
 *
 * Not currently called by the production spawn_agents handler (which pre-
 * allocates), but kept as a tested public convenience API for future callers
 * with deferred-first-chunk coroutines — see the
 * `registerBackgroundAgentJob combines allocation + attachment` unit test.
 */
export function registerBackgroundAgentJob(params: {
  agentType: string
  agentName: string
  promise: Promise<unknown>
}): BackgroundAgentJob {
  const { agentType, agentName, promise } = params
  const job = allocateBackgroundAgentJob({ agentType, agentName })
  attachBackgroundAgentPromise(job, promise)
  return job
}

/**
 * Attach settle handlers that transition the job to 'completed' or 'error'.
 * Detached from registration so the caller doesn't need to remember to wire
 * `.then`/`.catch` at every registration site.
 */
function attachJobCompletionHandlers(job: BackgroundAgentJob): void {
  job.promise.then(
    (result) => {
      job.status = 'completed'
      job.result = result
    },
    (error) => {
      job.status = 'error'
      job.error = error instanceof Error ? error.message : String(error)
    },
  )
}

/**
 * Append a streamed chunk to a job's ring buffer. Evicts the oldest entry
 * when the buffer exceeds {@link MAX_BUFFERED_CHUNKS} to bound memory.
 */
export function appendBackgroundAgentChunk(
  jobId: string,
  chunk: BackgroundAgentChunk,
): void {
  const job = jobs.get(jobId)
  if (!job) return
  job.chunks.push(chunk)
  if (job.chunks.length > MAX_BUFFERED_CHUNKS) {
    job.chunks.shift()
    // Keep readOffset sane if we evict chunks the poller hasn't seen yet.
    if (job.readOffset > 0) job.readOffset -= 1
  }
}

/**
 * Look up a background agent job by id. Returns undefined for unknown ids.
 */
export function getBackgroundAgentJob(
  jobId: string,
): BackgroundAgentJob | undefined {
  return jobs.get(jobId)
}

/**
 * Return the chunks appended since the last poll for this job, advancing the
 * job's read offset. Returns an empty array when there is nothing new. Never
 * throws.
 *
 * Because the ring buffer may evict old chunks on long agents, a poll after
 * eviction returns only the surviving unconsumed chunks (the offset is
 * adjusted in {@link appendBackgroundAgentChunk} to stay valid).
 */
export function readNewBackgroundAgentChunks(
  job: BackgroundAgentJob,
): BackgroundAgentChunk[] {
  const available = job.chunks.slice(job.readOffset)
  job.readOffset = job.chunks.length
  return available
}

/** Test-only: clear the registry between tests. */
export function __clearBackgroundAgentJobsForTest(): void {
  jobs.clear()
  jobCounter = 0
}