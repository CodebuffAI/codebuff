/**
 * Centralized durable plan artifact policy.
 *
 * Single source of truth for the allowed `.agents/sessions/<slug>/` artifact
 * basenames, path normalization, and validation rules shared by:
 *  - The `create_plan` runtime handler (SPEC.md, PLAN.md, STATUS.md, LESSONS.md).
 *  - The `update_plan_status` runtime handler (PLAN.md, STATUS.md, LESSONS.md).
 *  - The CLI plan-artifact reader (lists all four artifacts + STATE.json).
 *
 * Keeping these rules in one module ensures the CLI, runtime handlers, and
 * any future call sites stay in lockstep instead of drifting in regex/list.
 */

import fs from 'fs'
import path from 'path'

/** Artifact basenames allowed under `.agents/sessions/<slug>/`. */
export const PLAN_ARTIFACT_NAMES = [
  'SPEC.md',
  'PLAN.md',
  'STATUS.md',
  'LESSONS.md',
] as const

export type PlanArtifactName = (typeof PLAN_ARTIFACT_NAMES)[number]

/**
 * Artifact basenames that `update_plan_status` is permitted to edit.
 *
 * Extended in P0.18–P0.20 to allow PLAN.md for tri-state task toggles and
 * `<!-- current-task: ... -->` pointer updates. SPEC.md remains create-only.
 */
export const UPDATABLE_PLAN_ARTIFACT_NAMES = [
  'PLAN.md',
  'STATUS.md',
  'LESSONS.md',
] as const

export type UpdatablePlanArtifactName =
  (typeof UPDATABLE_PLAN_ARTIFACT_NAMES)[number]

/** Session status values persisted in `.agents/sessions/<slug>/STATE.json`. */
export const PLAN_SESSION_STATUSES = [
  'draft',
  'ready',
  'active',
  'executing',
  'validating',
  'reviewing',
  'blocked',
  'paused',
  'completed',
  'archived',
] as const
export type PlanSessionStatus = (typeof PLAN_SESSION_STATUSES)[number]

/** Tri-state task status values (plus cancelled/blocked extensions). */
export const PLAN_TASK_STATUSES = [
  'pending',
  'in_progress',
  'done',
  'cancelled',
  'blocked',
] as const
export type PlanTaskStatus = (typeof PLAN_TASK_STATUSES)[number]

/** Map from tri-state task status to the checkbox mark used in markdown. */
export const TASK_STATUS_MARK: Record<PlanTaskStatus, string> = {
  pending: ' ',
  in_progress: '~',
  done: 'x',
  cancelled: '/',
  blocked: '!',
}

/** Inverse: parse a checkbox mark back to a task status. */
export const TASK_MARK_STATUS: Record<string, PlanTaskStatus> = {
  ' ': 'pending',
  '~': 'in_progress',
  x: 'done',
  X: 'done',
  '/': 'cancelled',
  '!': 'blocked',
}

/** Shape of `.agents/sessions/<slug>/STATE.json` (P0.20). */
export type PlanSessionState = {
  /** Schema version for forward-compatible migrations. */
  schemaVersion: 2
  /** Session slug, mirrors the directory name. */
  slug: string
  /** Lifecycle status. */
  status: PlanSessionStatus
  /** Slug/id of the currently active task, or null if no task is in progress. */
  currentTask: string | null
  /** Monotonic compare-and-swap revision for deterministic state updates. */
  revision: number
  /** Last successfully completed validation/review checkpoint. */
  checkpoint: {
    taskId: string
    phase: 'validation' | 'review'
    passed: boolean
    summary?: string
    recordedAt: string
  } | null
  /** ISO-8601 timestamp when the state file was first created. */
  createdAt: string
  /** ISO-8601 timestamp of the most recent state mutation. */
  updatedAt: string
}

/** Strict shape: optional leading "./" then ".agents/sessions/<slug>/<ARTIFACT>" */
const ALLOWED_SESSION_ARTIFACT_RE =
  /^(?:\.\/)?\.agents\/sessions\/([A-Za-z0-9._-]+)\/(SPEC|PLAN|STATUS|LESSONS)\.md$/

/** Strict shape: optional leading "./" then ".agents/sessions/<slug>/(PLAN|STATUS|LESSONS).md" */
const ALLOWED_UPDATE_ARTIFACT_RE =
  /^(?:\.\/)?\.agents\/sessions\/([A-Za-z0-9._-]+)\/(PLAN|STATUS|LESSONS)\.md$/

/** Matches a normalized durable session PLAN.md path. */
const SESSION_PLAN_RE = /(?:^|\/)\.agents\/sessions\/([^/]+)\/PLAN\.md$/i

/**
 * Normalize a path for validation: convert backslashes to forward slashes.
 * Does not collapse `..` segments — those are rejected as traversal attempts.
 */
export function normalizePlanPath(p: string): string {
  return p.replace(/\\/g, '/')
}

/** Returns true if `p` is an absolute path (POSIX or Windows-style). */
function isAbsolutePlanPath(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:\//.test(p)
}

/** Returns true if `p` contains a `..` traversal segment. */
function hasTraversalSegment(p: string): boolean {
  return p.split('/').includes('..')
}

/**
 * Validate a `create_plan` artifact path. Returns an error string when
 * invalid, or null when the path is an allowed durable session artifact.
 */
export function validatePlanArtifactPath(path: string): string | null {
  if (typeof path !== 'string' || !path.trim()) {
    return 'create_plan: path must be a non-empty string.'
  }
  const normalized = normalizePlanPath(path.trim())
  if (isAbsolutePlanPath(normalized)) {
    return `create_plan: absolute paths are not allowed (got "${path}"). Use .agents/sessions/<slug>/(${PLAN_ARTIFACT_NAMES.join('|')}).`
  }
  if (hasTraversalSegment(normalized)) {
    return `create_plan: path traversal ("..") is not allowed (got "${path}").`
  }
  if (!ALLOWED_SESSION_ARTIFACT_RE.test(normalized)) {
    return `create_plan: only .agents/sessions/<slug>/(${PLAN_ARTIFACT_NAMES.join('|')}) paths are allowed (got "${path}").`
  }
  return null
}

/**
 * Validate an `update_plan_status` artifact path. Returns an error string
 * when invalid, or null when the path is an allowed PLAN.md/STATUS.md/LESSONS.md
 * under `.agents/sessions/<slug>/`.
 */
export function validatePlanStatusPath(input: string): string | null {
  if (typeof input !== 'string' || !input.trim()) {
    return 'update_plan_status: path must be a non-empty string.'
  }
  const normalized = normalizePlanPath(input.trim())
  if (isAbsolutePlanPath(normalized)) {
    return `update_plan_status: absolute paths are not allowed (got "${input}"). Use .agents/sessions/<slug>/(${UPDATABLE_PLAN_ARTIFACT_NAMES.join('|')}).`
  }
  if (hasTraversalSegment(normalized)) {
    return `update_plan_status: path traversal ("..") is not allowed (got "${input}").`
  }
  if (!ALLOWED_UPDATE_ARTIFACT_RE.test(normalized)) {
    return `update_plan_status: only .agents/sessions/<slug>/(${UPDATABLE_PLAN_ARTIFACT_NAMES.join('|')}) paths are allowed (got "${input}").`
  }
  return null
}

/** Returns true when `path` is a `.agents/sessions/<slug>/PLAN.md`. */
export function isSessionPlanPath(path: string): boolean {
  return SESSION_PLAN_RE.test(normalizePlanPath(path))
}

/** Returns the session directory (e.g. `.agents/sessions/foo`) for a given
 * session artifact path, or null when the path is not a session artifact.
 */
export function getSessionDirForArtifact(path: string): string | null {
  const normalized = normalizePlanPath(path)
  const match = normalized.match(
    /^(?:\.\/)?(\.agents\/sessions\/[A-Za-z0-9._-]+)\/(?:SPEC|PLAN|STATUS|LESSONS)\.md$/,
  )
  return match ? match[1] : null
}

/** Returns the session slug for a given session artifact path, or null. */
export function getSessionSlugForArtifact(path: string): string | null {
  const dir = getSessionDirForArtifact(path)
  if (!dir) return null
  const parts = dir.split('/')
  return parts[parts.length - 1] ?? null
}

/** Filename for a session's state file. */
export const STATE_FILENAME = 'STATE.json'

/** Filename for the project-wide active session pointer. */
export const ACTIVE_SESSION_POINTER_FILENAME = 'ACTIVE_SESSION'

// ---------------------------------------------------------------------------
// Session state (P0.20)
// ---------------------------------------------------------------------------

/** Default project root resolver; tests can override via setProjectRoot(). */
let projectRootResolver: () => string = () => {
  throw new Error('Project root resolver not configured')
}

/** Override the project-root resolver (used by tests and CLI bootstrap). */
export function setProjectRootResolver(fn: () => string): void {
  projectRootResolver = fn
}

/** Read STATE.json for a session. Returns null if not present. */
export function readPlanState(
  slug: string,
  projectRoot?: string,
): PlanSessionState | null {
  const sessionDir = resolveSessionDir(slug, projectRoot)
  if (!sessionDir) return null
  const statePath = path.join(sessionDir, STATE_FILENAME)
  if (!fs.existsSync(statePath)) return null
  try {
    const raw = fs.readFileSync(statePath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<PlanSessionState>
    return normalizePlanState(parsed, slug)
  } catch (err) {
    console.debug(
      `[plan-artifacts] readPlanState failed for ${slug}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return null
  }
}

/**
 * Persist STATE.json for a session. Creates the session dir if needed.
 *
 * `projectRoot` (optional) lets callers that already hold the project root
 * pass it explicitly instead of relying on the module-level resolver. This
 * avoids the concurrent-run race where `setProjectRootResolver` mutates a
 * shared global. When omitted, the resolver is used (fail-loud if unset).
 */
export function writePlanState(
  slug: string,
  patch: Partial<
    Omit<PlanSessionState, 'schemaVersion' | 'slug' | 'createdAt' | 'revision'>
  >,
  projectRoot?: string,
): PlanSessionState | null {
  const sessionDir = resolveSessionDir(slug, projectRoot)
  if (!sessionDir) return null
  if (!isValidPlanSlug(slug)) return null

  const now = new Date().toISOString()
  const existing = readPlanState(slug, projectRoot)
  const next: PlanSessionState = {
    schemaVersion: 2,
    slug,
    status: patch.status ?? existing?.status ?? 'active',
    currentTask:
      patch.currentTask !== undefined
        ? patch.currentTask
        : (existing?.currentTask ?? null),
    revision: (existing?.revision ?? 0) + 1,
    checkpoint:
      patch.checkpoint !== undefined
        ? patch.checkpoint
        : (existing?.checkpoint ?? null),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  fs.mkdirSync(sessionDir, { recursive: true })
  const statePath = path.join(sessionDir, STATE_FILENAME)
  const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tempPath, JSON.stringify(next, null, 2) + '\n', 'utf8')
  fs.renameSync(tempPath, statePath)
  return next
}

/** Delete STATE.json (used when archiving a session). */
export function clearPlanState(slug: string): boolean {
  const sessionDir = resolveSessionDir(slug)
  if (!sessionDir) return false
  const statePath = path.join(sessionDir, STATE_FILENAME)
  if (!fs.existsSync(statePath)) return false
  fs.unlinkSync(statePath)
  return true
}

/** Defensively normalize a parsed STATE.json, filling missing fields. */
function normalizePlanState(
  parsed: Partial<PlanSessionState>,
  slug: string,
): PlanSessionState {
  const status: PlanSessionStatus = PLAN_SESSION_STATUSES.includes(
    parsed.status as PlanSessionStatus,
  )
    ? (parsed.status as PlanSessionStatus)
    : 'active'
  return {
    schemaVersion: 2,
    slug,
    status,
    currentTask:
      typeof parsed.currentTask === 'string' || parsed.currentTask === null
        ? parsed.currentTask
        : null,
    revision:
      typeof parsed.revision === 'number' && parsed.revision >= 0
        ? parsed.revision
        : 0,
    checkpoint:
      parsed.checkpoint && typeof parsed.checkpoint === 'object'
        ? parsed.checkpoint
        : null,
    createdAt:
      typeof parsed.createdAt === 'string'
        ? parsed.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof parsed.updatedAt === 'string'
        ? parsed.updatedAt
        : new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Active session pointer (P0.17)
// ---------------------------------------------------------------------------

/** Read the project-wide active session pointer. */
export function readActiveSessionPointer(): string | null {
  const root = safeProjectRoot()
  if (!root) return null
  const pointerPath = path.join(
    root,
    '.agents',
    ACTIVE_SESSION_POINTER_FILENAME,
  )
  if (!fs.existsSync(pointerPath)) return null
  try {
    const raw = fs.readFileSync(pointerPath, 'utf8').trim()
    if (!raw) return null
    // Only single-line slugs are accepted; reject anything with newlines.
    if (/[\r\n]/.test(raw)) return null
    return isValidPlanSlug(raw) ? raw : null
  } catch (err) {
    console.debug(
      `[plan-artifacts] readActiveSessionPointer failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return null
  }
}

/** Set the project-wide active session pointer. */
export function writeActiveSessionPointer(slug: string): boolean {
  const root = safeProjectRoot()
  if (!root) return false
  if (!isValidPlanSlug(slug)) return false
  const pointerDir = path.join(root, '.agents')
  fs.mkdirSync(pointerDir, { recursive: true })
  const pointerPath = path.join(pointerDir, ACTIVE_SESSION_POINTER_FILENAME)
  fs.writeFileSync(pointerPath, slug + '\n', 'utf8')
  return true
}

/** Clear the project-wide active session pointer. */
export function clearActiveSessionPointer(): boolean {
  const root = safeProjectRoot()
  if (!root) return false
  const pointerPath = path.join(
    root,
    '.agents',
    ACTIVE_SESSION_POINTER_FILENAME,
  )
  if (!fs.existsSync(pointerPath)) return false
  fs.unlinkSync(pointerPath)
  return true
}

// ---------------------------------------------------------------------------
// Current-task annotation in PLAN.md (P0.19)
// ---------------------------------------------------------------------------

const CURRENT_TASK_ANNOTATION_RE =
  /^(\s*)<!--\s*current-task:\s*(.*?)\s*-->\s*$/m

const CURRENT_TASK_ANNOTATION_HEADER = '<!-- current-task:'

/** Read the `<!-- current-task: ... -->` annotation from a PLAN.md body. */
export function readCurrentTaskAnnotation(content: string): string | null {
  const match = content.match(CURRENT_TASK_ANNOTATION_RE)
  if (!match) return null
  const raw = match[2].trim()
  if (raw.toLowerCase() === 'none' || raw === '') return null
  return raw
}

/** Set/clear the `<!-- current-task: ... -->` annotation across a line array. */
export function setCurrentTaskAnnotationLines(
  lines: string[],
  task: string | null,
): string[] {
  const annotation = task
    ? `${CURRENT_TASK_ANNOTATION_HEADER} ${task} -->`
    : `${CURRENT_TASK_ANNOTATION_HEADER} none -->`
  const existingIdx = lines.findIndex((line) =>
    CURRENT_TASK_ANNOTATION_RE.test(line),
  )
  const next = lines.slice()
  if (existingIdx >= 0) {
    next[existingIdx] = annotation
  } else {
    // Insert right after the first H1 heading if present, otherwise at top.
    const insertIdx = findInsertionIndex(next)
    next.splice(insertIdx, 0, annotation)
  }
  return next
}

/** Set/clear the `<!-- current-task: ... -->` annotation in a PLAN.md body. */
export function setCurrentTaskAnnotation(
  content: string,
  task: string | null,
): string {
  return setCurrentTaskAnnotationLines(content.split('\n'), task).join('\n')
}

function findInsertionIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (/^#\s/.test(lines[i])) return i + 1
  }
  return 0
}

// ---------------------------------------------------------------------------
// JSONL event log (P0.13)
// ---------------------------------------------------------------------------

/** Filename for a session's JSONL event log. */
export const EVENTS_FILENAME = 'EVENTS.jsonl'

/** Allowed event kinds emitted by `update_plan_status`. */
export const PLAN_EVENT_KINDS = [
  'task_update',
  'session_status',
  'current_task',
  'append_lesson',
] as const

export type PlanEventKind = (typeof PLAN_EVENT_KINDS)[number]

/** A single event record in `.agents/sessions/<slug>/EVENTS.jsonl`. */
export type PlanEvent = {
  /** ISO-8601 timestamp. */
  ts: string
  /** Event kind (one of PLAN_EVENT_KINDS). */
  kind: PlanEventKind
  /** Human-readable one-line summary. */
  summary: string
  /** Optional structured payload; shape varies by `kind`. */
  payload?: unknown
}

/** Options for {@link readPlanEvents}. */
export type ReadPlanEventsOptions = {
  /** Filter to a single event kind. */
  kind?: PlanEventKind
  /** Return at most `limit` events (most recent last when reading in order). */
  limit?: number
}

/**
 * Append a single event line to `.agents/sessions/<slug>/EVENTS.jsonl`.
 *
 * Writes are append-only and use `fs.appendFileSync` with a single string
 * payload, so the only interleaving risk is two concurrent processes
 * appending at the same instant — in that case each line stays intact on
 * most POSIX filesystems because `appendFileSync` issues a single write(2)
 * per call for payloads <= PIPE_BUF (4096 bytes on Linux). The runtime
 * handler serializes `update_plan_status` calls per session via
 * `previousToolCallFinished`, so concurrent appends are not expected in
 * practice; this is documented in LESSONS.md.
 *
 * Returns the persisted event (with a normalized `ts`) or null when the
 * slug is invalid or the project-root resolver is unset.
 */
export function appendPlanEvent(
  slug: string,
  event: Omit<PlanEvent, 'ts'> & { ts?: string },
  projectRoot?: string,
): PlanEvent | null {
  const sessionDir = resolveSessionDir(slug, projectRoot)
  if (!sessionDir) return null

  const ts = event.ts ?? new Date().toISOString()
  const record: PlanEvent = {
    ts,
    kind: event.kind,
    summary: event.summary,
    ...(event.payload !== undefined ? { payload: event.payload } : {}),
  }

  fs.mkdirSync(sessionDir, { recursive: true })
  const eventsPath = path.join(sessionDir, EVENTS_FILENAME)
  const line = JSON.stringify(record) + '\n'
  fs.appendFileSync(eventsPath, line, 'utf8')
  return record
}

/**
 * Read events from `.agents/sessions/<slug>/EVENTS.jsonl`.
 *
 * Returns an empty array when the slug is invalid, the project-root resolver
 * is unset, or the file does not exist. Malformed lines are skipped (and
 * never throw) so a single corrupt line cannot break the timeline CLI.
 */
export function readPlanEvents(
  slug: string,
  opts: ReadPlanEventsOptions = {},
): PlanEvent[] {
  const sessionDir = resolveSessionDir(slug)
  if (!sessionDir) return []
  if (!isValidPlanSlug(slug)) return []

  const eventsPath = path.join(sessionDir, EVENTS_FILENAME)
  if (!fs.existsSync(eventsPath)) return []

  let raw: string
  try {
    raw = fs.readFileSync(eventsPath, 'utf8')
  } catch (err) {
    console.debug(
      `[plan-artifacts] readPlanEvents failed for ${slug}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return []
  }

  const events: PlanEvent[] = []
  const lines = raw.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch (err) {
      // Skip malformed lines — never throw from a reader.
      console.debug(
        `[plan-artifacts] readPlanEvents skipping malformed line for ${slug}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      continue
    }
    const event = normalizePlanEvent(parsed)
    if (!event) continue
    if (opts.kind && event.kind !== opts.kind) continue
    events.push(event)
  }

  if (opts.limit !== undefined && opts.limit >= 0) {
    return events.slice(0, opts.limit)
  }
  return events
}

/** Defensively normalize a parsed event line into a PlanEvent, or null. */
function normalizePlanEvent(parsed: unknown): PlanEvent | null {
  if (typeof parsed !== 'object' || parsed === null) return null
  const obj = parsed as Record<string, unknown>
  const kind = obj.kind
  if (
    typeof kind !== 'string' ||
    !PLAN_EVENT_KINDS.includes(kind as PlanEventKind)
  ) {
    return null
  }
  if (typeof obj.ts !== 'string' || typeof obj.summary !== 'string') {
    return null
  }
  const event: PlanEvent = {
    ts: obj.ts,
    kind: kind as PlanEventKind,
    summary: obj.summary,
  }
  if (obj.payload !== undefined) {
    event.payload = obj.payload
  }
  return event
}

// ---------------------------------------------------------------------------
// Tri-state task parsing (P0.18)
// ---------------------------------------------------------------------------

/**
 * Match a checklist line with any of the tri-state marks. Captures:
 *  1. leading whitespace + list marker prefix
 *  2. the checkbox mark character (space, x, X, ~, /, !)
 *  3. the trailing text
 *
 * This is the canonical tri-state checklist regex. The runtime handler and
 * the CLI both import this constant so the two layers cannot drift on what
 * counts as a checklist line.
 */
export const TRI_STATE_CHECKBOX_LINE_RE =
  /^(\s*[-*]\s*\[)([ xX~/!])(\]\s*)(.*)$/

export type PlanTaskRecord = {
  id: string
  title: string
  status: PlanTaskStatus
  dependencies: string[]
  hasAcceptanceCriteria: boolean
  hasValidationGate: boolean
}

export type PlanPreflightResult = {
  ok: boolean
  tasks: PlanTaskRecord[]
  nextTaskId: string | null
  errors: string[]
  warnings: string[]
}

const TASK_ID_RE = /^([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+)\b[\s:—-]*(.*)$/

/** Parse stable-ID checklist tasks and their indented execution contract. */
export function parsePlanTasks(content: string): PlanTaskRecord[] {
  const tasks: PlanTaskRecord[] = []
  let current: PlanTaskRecord | null = null
  for (const line of content.split('\n')) {
    const checkbox = line.match(TRI_STATE_CHECKBOX_LINE_RE)
    if (checkbox) {
      const task = checkbox[4].trim().match(TASK_ID_RE)
      current = task
        ? {
            id: task[1],
            title: task[2].trim(),
            status: TASK_MARK_STATUS[checkbox[2]] ?? 'pending',
            dependencies: [],
            hasAcceptanceCriteria: false,
            hasValidationGate: false,
          }
        : null
      if (current) tasks.push(current)
      continue
    }
    if (!current) continue
    const field = line.trim().match(/^[-*]\s*(Depends on|Acceptance|Validate):\s*(.+)$/i)
    if (!field) continue
    const key = field[1].toLowerCase()
    if (key === 'depends on') {
      current.dependencies = field[2]
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    } else if (key === 'acceptance') {
      current.hasAcceptanceCriteria = true
    } else if (key === 'validate') {
      current.hasValidationGate = true
    }
  }
  return tasks
}

/** Validate that a PLAN.md is deterministic enough for execute-plan mode. */
export function preflightPlan(content: string): PlanPreflightResult {
  const tasks = parsePlanTasks(content)
  const errors: string[] = []
  const warnings: string[] = []
  const ids = new Set<string>()
  for (const task of tasks) {
    if (ids.has(task.id)) errors.push(`Duplicate task ID: ${task.id}`)
    ids.add(task.id)
  }
  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      if (!ids.has(dependency)) {
        errors.push(`${task.id} depends on missing task ${dependency}`)
      }
    }
    if (!task.hasAcceptanceCriteria) {
      warnings.push(`${task.id} has no Acceptance field`)
    }
    if (!task.hasValidationGate) {
      warnings.push(`${task.id} has no Validate field`)
    }
  }
  if (tasks.length === 0) {
    errors.push('PLAN.md has no checklist tasks with stable IDs')
  }
  const done = new Set(
    tasks
      .filter((task) => task.status === 'done' || task.status === 'cancelled')
      .map((task) => task.id),
  )
  const actionable = tasks.find(
    (task) =>
      (task.status === 'pending' || task.status === 'in_progress') &&
      task.dependencies.every((dependency) => done.has(dependency)),
  )
  return {
    ok: errors.length === 0,
    tasks,
    nextTaskId: actionable?.id ?? null,
    errors,
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Slug validation
// ---------------------------------------------------------------------------

const PLAN_SLUG_RE = /^[A-Za-z0-9._-]+$/

/** True when `slug` is safe to use as a directory name. */
export function isValidPlanSlug(slug: string): boolean {
  if (typeof slug !== 'string' || slug.length === 0) return false
  if (slug === '.' || slug === '..') return false
  return PLAN_SLUG_RE.test(slug)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function safeProjectRoot(): string | null {
  try {
    return projectRootResolver()
  } catch (err) {
    console.debug(
      `[plan-artifacts] projectRootResolver threw: ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
    return null
  }
}

function resolveSessionDir(slug: string, projectRoot?: string): string | null {
  if (!isValidPlanSlug(slug)) return null
  const root = projectRoot ?? safeProjectRoot()
  if (!root) return null
  return path.join(root, '.agents', 'sessions', slug)
}

// Companion tests live in `common/src/util/__tests__/plan-artifacts.test.ts`
// and pin the contract exercised by the `create_plan` and `update_plan_status`
// runtime handlers plus the CLI plan-artifact reader.
