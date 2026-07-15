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
const MAX_BUFFERED_CHUNK_BYTES = 64 * 1024
const MAX_CONSUMER_CURSORS = 32
const MAX_BACKGROUND_AGENT_JOBS = 100
const MAX_RUNNING_BACKGROUND_AGENT_JOBS = 32
const MAX_RUNNING_BACKGROUND_AGENT_JOBS_PER_ROOT = 8
const SETTLED_JOB_TTL_MS = 30 * 60 * 1000

/**
 * A single streamed chunk from a background agent turn. Mirrors the
 * `PrintModeEvent` shape but is kept minimal to avoid coupling the registry
 * to the full event union. The `text` field carries assistant text; `type`
 * preserves the original event type for the polling caller to interpret.
 */
export interface BackgroundAgentChunk {
  /** Monotonic job-local sequence number assigned by the registry. */
  sequence: number
  /** Original event type (e.g. 'text', 'tool_call', 'tool_result'). */
  type: string
  /** Serialized chunk payload (opaque to the registry). */
  payload: unknown
  /** Wall-clock timestamp when the chunk was appended. */
  timestamp: number
}

export type BackgroundAgentJobStatus =
  | 'running'
  | 'completed'
  | 'error'
  | 'cancelled'

export interface BackgroundAgentJob {
  jobId: string
  /** Agent type string (e.g. 'basher', 'code-searcher'). */
  agentType: string
  /** Agent template display name. */
  agentName: string
  owner: {
    clientSessionId: string
    rootRunId: string
    parentRunId: string
    parentAgentId: string
    userInputId: string
  }
  status: BackgroundAgentJobStatus
  startedAt: number
  completedAt?: number
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
  /** Per-consumer sequence cursors for backward-compatible cursor omission. */
  consumerCursors: Map<string, number>
  nextSequence: number
  /** Unseen chunks evicted since the previous poll. */
  droppedChunks: number
  /** Controller owned by this job and used for explicit cancellation. */
  abortController: AbortController
  /** The detached coroutine promise. Stored for lifecycle bookkeeping only. */
  promise: Promise<unknown>
}

const jobs = new Map<string, BackgroundAgentJob>()
function nextJobId(): string {
  return `bg-agent-${crypto.randomUUID()}`
}

function sweepBackgroundAgentJobs(now = Date.now()): void {
  for (const [jobId, job] of jobs) {
    if (
      job.status !== 'running' &&
      job.completedAt !== undefined &&
      now - job.completedAt > SETTLED_JOB_TTL_MS
    ) {
      jobs.delete(jobId)
    }
  }

  if (jobs.size <= MAX_BACKGROUND_AGENT_JOBS) return
  const settled = [...jobs.values()]
    .filter((job) => job.status !== 'running')
    .sort(
      (a, b) => (a.completedAt ?? a.startedAt) - (b.completedAt ?? b.startedAt),
    )
  for (const job of settled) {
    if (jobs.size <= MAX_BACKGROUND_AGENT_JOBS) break
    jobs.delete(job.jobId)
  }
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
  owner?: BackgroundAgentJob['owner']
}): BackgroundAgentJob {
  sweepBackgroundAgentJobs()
  const owner = params.owner ?? {
    clientSessionId: 'unknown-session',
    rootRunId: 'unknown-root',
    parentRunId: 'unknown-parent-run',
    parentAgentId: 'unknown-parent-agent',
    userInputId: 'unknown-input',
  }
  const running = [...jobs.values()].filter((job) => job.status === 'running')
  if (running.length >= MAX_RUNNING_BACKGROUND_AGENT_JOBS) {
    throw new Error(
      `Background agent concurrency limit reached (${MAX_RUNNING_BACKGROUND_AGENT_JOBS}). Join or cancel an existing job before spawning another.`,
    )
  }
  const runningForRoot = running.filter(
    (job) =>
      job.owner.clientSessionId === owner.clientSessionId &&
      job.owner.rootRunId === owner.rootRunId,
  )
  if (runningForRoot.length >= MAX_RUNNING_BACKGROUND_AGENT_JOBS_PER_ROOT) {
    throw new Error(
      `Background agent concurrency limit reached for this run (${MAX_RUNNING_BACKGROUND_AGENT_JOBS_PER_ROOT}). Join or cancel an existing job before spawning another.`,
    )
  }
  const { agentType, agentName } = params
  const jobId = nextJobId()
  const job: BackgroundAgentJob = {
    jobId,
    agentType,
    agentName,
    owner,
    status: 'running',
    startedAt: Date.now(),
    chunks: [],
    readOffset: 0,
    consumerCursors: new Map(),
    nextSequence: 1,
    droppedChunks: 0,
    abortController: new AbortController(),
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
  owner?: BackgroundAgentJob['owner']
}): BackgroundAgentJob {
  const { agentType, agentName, promise, owner } = params
  const job = allocateBackgroundAgentJob({ agentType, agentName, owner })
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
      if (job.status === 'cancelled') return
      job.status = 'completed'
      job.result = result
      job.completedAt = Date.now()
    },
    (error) => {
      if (job.status === 'cancelled') return
      job.status = 'error'
      job.error = error instanceof Error ? error.message : String(error)
      job.completedAt = Date.now()
    },
  )
}

/**
 * Append a streamed chunk to a job's ring buffer. Evicts the oldest entry
 * when the buffer exceeds {@link MAX_BUFFERED_CHUNKS} to bound memory.
 */
export function appendBackgroundAgentChunk(
  jobId: string,
  chunk: Omit<BackgroundAgentChunk, 'sequence'> & { sequence?: number },
): void {
  const job = jobs.get(jobId)
  if (!job) return
  let payload = chunk.payload
  try {
    const serialized = JSON.stringify(payload)
    const serializedBytes = Buffer.from(serialized, 'utf8')
    if (serializedBytes.byteLength > MAX_BUFFERED_CHUNK_BYTES) {
      payload = {
        truncated: true,
        originalBytes: serializedBytes.byteLength,
        preview: `${serializedBytes.subarray(0, 48_000).toString('utf8')}...[truncated background chunk]...${serializedBytes.subarray(-8_000).toString('utf8')}`,
      }
    }
  } catch {
    payload = { truncated: true, preview: 'Unserializable background chunk.' }
  }
  job.chunks.push({
    ...chunk,
    payload,
    sequence: chunk.sequence ?? job.nextSequence++,
  })
  if (job.chunks.length > MAX_BUFFERED_CHUNKS) {
    job.chunks.shift()
    // Keep readOffset sane if we evict chunks the poller hasn't seen yet.
    if (job.readOffset > 0) {
      job.readOffset -= 1
    } else {
      job.droppedChunks += 1
    }
  }
}

/**
 * Look up a background agent job by id. Returns undefined for unknown ids.
 */
export function getBackgroundAgentJob(
  jobId: string,
): BackgroundAgentJob | undefined {
  sweepBackgroundAgentJobs()
  return jobs.get(jobId)
}

export function listRunningBackgroundAgentJobs(owner?: {
  clientSessionId: string
  rootRunId: string
}): Array<
  Pick<BackgroundAgentJob, 'jobId' | 'agentType' | 'agentName' | 'startedAt'>
> {
  sweepBackgroundAgentJobs()
  return [...jobs.values()]
    .filter(
      (job) =>
        job.status === 'running' &&
        (!owner ||
          (job.owner.clientSessionId === owner.clientSessionId &&
            job.owner.rootRunId === owner.rootRunId)),
    )
    .map(({ jobId, agentType, agentName, startedAt }) => ({
      jobId,
      agentType,
      agentName,
      startedAt,
    }))
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

export function readBackgroundAgentChunks(params: {
  job: BackgroundAgentJob
  consumerId: string
  cursor?: number
}): {
  chunks: BackgroundAgentChunk[]
  nextCursor: number
  droppedChunks: number
} {
  const { job, consumerId } = params
  const requestedCursor =
    params.cursor ?? job.consumerCursors.get(consumerId) ?? 0
  const latestSequence = job.chunks.at(-1)?.sequence ?? job.nextSequence - 1
  const cursor = Math.max(
    0,
    Math.min(
      Number.isFinite(requestedCursor) ? Math.floor(requestedCursor) : 0,
      latestSequence,
    ),
  )
  const firstSequence = job.chunks[0]?.sequence ?? job.nextSequence
  const droppedChunks = Math.max(0, firstSequence - cursor - 1)
  const chunks = job.chunks.filter((chunk) => chunk.sequence > cursor)
  const nextCursor = chunks.at(-1)?.sequence ?? cursor
  job.consumerCursors.set(consumerId, nextCursor)
  if (job.consumerCursors.size > MAX_CONSUMER_CURSORS) {
    const oldest = job.consumerCursors.keys().next().value
    if (typeof oldest === 'string' && oldest !== consumerId) {
      job.consumerCursors.delete(oldest)
    }
  }
  return { chunks, nextCursor, droppedChunks }
}

export function backgroundAgentJobOwnedBy(
  job: BackgroundAgentJob,
  owner: { clientSessionId: string; rootRunId: string },
): boolean {
  return (
    job.owner.clientSessionId === owner.clientSessionId &&
    job.owner.rootRunId === owner.rootRunId
  )
}

/** Return and reset the count of unseen chunks evicted since the last poll. */
export function takeDroppedBackgroundAgentChunkCount(
  job: BackgroundAgentJob,
): number {
  const count = job.droppedChunks
  job.droppedChunks = 0
  return count
}

export function cancelBackgroundAgentJob(
  jobId: string,
): { cancelled: true; status: 'cancelled' } | { errorMessage: string } {
  const job = jobs.get(jobId)
  if (!job) {
    return { errorMessage: `No background agent job found with id "${jobId}".` }
  }
  if (job.status !== 'running') {
    return {
      errorMessage: `Background agent job "${jobId}" is already ${job.status}.`,
    }
  }
  job.status = 'cancelled'
  job.completedAt = Date.now()
  job.error = 'Cancelled by check_background_agent.'
  job.abortController.abort(new Error(job.error))
  return { cancelled: true, status: 'cancelled' }
}

/** Test-only: clear the registry between tests. */
export function __clearBackgroundAgentJobsForTest(): void {
  jobs.clear()
}
