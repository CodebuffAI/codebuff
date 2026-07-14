import * as fs from 'fs'
import * as path from 'path'

import {
  appendPlanEvent,
  normalizePlanPath,
  PLAN_TASK_STATUSES,
  PLAN_SESSION_STATUSES,
  TASK_STATUS_MARK,
  TRI_STATE_CHECKBOX_LINE_RE,
  readCurrentTaskAnnotation,
  readPlanState,
  setCurrentTaskAnnotationLines,
  validatePlanStatusPath as sharedValidatePlanStatusPath,
  writePlanState,
  type PlanSessionStatus,
  type PlanTaskStatus,
} from '@codebuff/common/util/plan-artifacts'
import { jsonToolResult } from '@codebuff/common/util/messages'
import { validatePlanTransition } from '../../../util/plan-execution-state'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

type ToolName = 'update_plan_status'

// TRI_STATE_CHECKBOX_LINE_RE is imported from @codebuff/common/util/plan-artifacts
// so the runtime handler shares the canonical tri-state regex with the CLI.
const CHECKBOX_LINE_RE = TRI_STATE_CHECKBOX_LINE_RE

const PLAN_SESSION_STATUS_SET: ReadonlySet<PlanSessionStatus> = new Set([
  ...PLAN_SESSION_STATUSES,
])

/**
 * Validate an update_plan_status path. Delegates to the centralized durable
 * plan artifact policy in @codebuff/common.
 */
export function validatePlanStatusPath(input: string): string | null {
  return sharedValidatePlanStatusPath(input)
}

type TaskUpdate = {
  taskId?: string
  task?: string
  completed?: boolean
  status?: PlanTaskStatus
  note?: string
}

type AppendEntry = {
  heading: string
  body: string
}

/** Map a tri-state `status` (or legacy `completed` boolean) to a checkbox mark. */
function resolveTaskMark(update: TaskUpdate): string | null {
  if (update.status !== undefined) {
    if (!PLAN_TASK_STATUSES.includes(update.status)) return null
    return TASK_STATUS_MARK[update.status]
  }
  if (update.completed === undefined) return null
  return update.completed ? 'x' : ' '
}

/**
 * Apply a single task update to the file's lines. Returns the new lines array
 * and a boolean indicating whether a matching line was found.
 */
export function applyTaskUpdate(
  lines: string[],
  update: TaskUpdate,
): { lines: string[]; matched: boolean } {
  const needle = update.task?.toLowerCase()
  const taskId = update.taskId?.trim().toLowerCase()
  const newMark = resolveTaskMark(update)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(CHECKBOX_LINE_RE)
    if (!m) continue
    const [, prefix, mark, gap, rest] = m
    const normalizedRest = rest.trimStart().toLowerCase()
    const matchesId = taskId
      ? normalizedRest === taskId ||
        normalizedRest.startsWith(`${taskId} `) ||
        normalizedRest.startsWith(`${taskId}:`) ||
        normalizedRest.startsWith(`${taskId} —`)
      : false
    const matchesText = needle ? normalizedRest.includes(needle) : false
    if (!matchesId && !matchesText) continue

    const resolvedMark = newMark ?? mark
    let newRest = rest
    if (update.note && update.note.trim()) {
      const trimmedNote = update.note.trim()
      const noteSuffix = ` (${trimmedNote})`
      if (!newRest.trimEnd().endsWith(noteSuffix)) {
        newRest = `${newRest.trimEnd()}${noteSuffix}`
      }
    }
    // Only allocate a new array once we know we are about to write — on miss,
    // return the original `lines` reference so the caller can distinguish
    // "no write happened" from "wrote a new copy".
    const next = lines.slice()
    next[i] = `${prefix}${resolvedMark}${gap}${newRest}`
    return { lines: next, matched: true }
  }
  return { lines, matched: false }
}

function buildAppendBlock(entry: AppendEntry, nowIso: string): string {
  const heading = entry.heading.trim().replace(/\s+/g, ' ')
  const body = entry.body.replace(/\s+$/g, '')
  return [
    '',
    '<!-- update_plan_status:appended -->',
    `## ${heading} — ${nowIso}`,
    '',
    body,
    '',
  ].join('\n')
}

export const handleUpdatePlanStatus = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<ToolName>
  logger: Logger
}): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall, logger } = params
  const {
    path: artifactPath,
    updates,
    append,
    sessionStatus,
    currentTask,
    expectedRevision,
    checkpoint,
  } = toolCall.input

  await previousToolCallFinished

  const pathError = validatePlanStatusPath(artifactPath)
  if (pathError) {
    logger.warn({ path: artifactPath }, 'Rejected update_plan_status path')
    return {
      output: jsonToolResult({
        file: artifactPath,
        errorMessage: pathError,
      }),
    }
  }

  const absolutePath = path.resolve(
    process.cwd(),
    normalizePlanPath(artifactPath.trim()),
  )

  if (!fs.existsSync(absolutePath)) {
    return {
      output: jsonToolResult({
        file: artifactPath,
        errorMessage: `update_plan_status: ${artifactPath} does not exist. Create it with create_plan first.`,
      }),
    }
  }

  const projectRoot = fs.realpathSync(process.cwd())
  const targetRealPath = fs.realpathSync(absolutePath)
  if (
    targetRealPath !== projectRoot &&
    !targetRealPath.startsWith(`${projectRoot}${path.sep}`)
  ) {
    return {
      output: jsonToolResult({
        file: artifactPath,
        errorMessage: `update_plan_status: ${artifactPath} resolves outside the project root.`,
      }),
    }
  }

  const writePath = targetRealPath
  const sessionDir = path.dirname(writePath)
  const slug = path.basename(sessionDir)
  const existingState = readPlanState(slug, projectRoot)
  if (
    expectedRevision !== undefined &&
    (existingState?.revision ?? 0) !== expectedRevision
  ) {
    return {
      output: jsonToolResult({
        file: artifactPath,
        errorMessage: `update_plan_status: stale STATE.json revision (expected ${expectedRevision}, current ${existingState?.revision ?? 0}). Re-read the session before retrying.`,
      }),
    }
  }
  const original = fs.readFileSync(writePath, 'utf8')
  const trailingNewline = original.endsWith('\n')
  let lines = original.split('\n')
  if (trailingNewline) {
    // Drop the trailing empty string produced by split so we can re-join safely.
    lines.pop()
  }

  const updateList: TaskUpdate[] = Array.isArray(updates) ? updates : []
  const matchedTasks: string[] = []
  const unmatchedTasks: string[] = []
  const transitionedToInProgress: string[] = []

  for (const update of updateList) {
    const result = applyTaskUpdate(lines, update)
    lines = result.lines
    if (result.matched) {
      matchedTasks.push(update.taskId ?? update.task ?? 'unknown task')
      if (update.status === 'in_progress') {
        transitionedToInProgress.push(
          update.taskId ?? update.task ?? 'unknown task',
        )
      }
    } else {
      unmatchedTasks.push(update.taskId ?? update.task ?? 'unknown task')
    }
  }

  // P0.19 — current-task annotation only takes effect when the artifact is
  // PLAN.md. We surface explicit `currentTask` first, then fall back to the
  // first task that transitioned to in_progress during this call.
  const isPlanArtifact = normalizePlanPath(artifactPath.trim()).endsWith(
    '/PLAN.md',
  )
  let currentTaskApplied: string | null | undefined = undefined
  if (isPlanArtifact) {
    if (currentTask !== undefined) {
      const trimmed = currentTask.trim()
      const nextPointer = trimmed.length === 0 ? null : trimmed
      // Patch the annotation in place via the line-based helper — avoids the
      // join+rewrite+split round-trip of the older string-only helper.
      lines = setCurrentTaskAnnotationLines(lines, nextPointer)
      currentTaskApplied = nextPointer
    } else if (transitionedToInProgress.length > 0) {
      const fallback = transitionedToInProgress[0]
      lines = setCurrentTaskAnnotationLines(lines, fallback)
      currentTaskApplied = fallback
    }
  }

  let appendedHeading: string | undefined
  if (append) {
    const block = buildAppendBlock(append, new Date().toISOString())
    lines.push(...block.split('\n'))
    appendedHeading = append.heading
  }

  const nextContent = lines.join('\n') + (trailingNewline ? '\n' : '')
  if (isPlanArtifact) {
    const transition = validatePlanTransition({
      originalContent: original,
      nextContent,
      updates: updateList,
      unmatchedTasks,
      currentTask:
        currentTaskApplied === undefined
          ? readCurrentTaskAnnotation(original)
          : currentTaskApplied,
      existingState,
      checkpoint,
    })
    if (!transition.ok) {
      return {
        output: jsonToolResult({
          file: artifactPath,
          errorMessage: `update_plan_status: ${transition.errors.join(' ')}`,
        }),
      }
    }
  }

  // P0.20 — persist session state (status / currentTask) whenever any
  // session-level control was supplied or we discovered an in-progress
  // transition that should be reflected in STATE.json.
  let sessionStateApplied: {
    status?: PlanSessionStatus
    currentTask?: string | null
  } | null = null
  if (
    sessionStatus !== undefined ||
    currentTaskApplied !== undefined ||
    checkpoint !== undefined
  ) {
    if (
      sessionStatus !== undefined &&
      !PLAN_SESSION_STATUS_SET.has(sessionStatus)
    ) {
      return {
        output: jsonToolResult({
          file: artifactPath,
          errorMessage: `update_plan_status: unknown sessionStatus "${sessionStatus}".`,
        }),
      }
    }
    const patch: Parameters<typeof writePlanState>[1] = {}
    if (sessionStatus !== undefined) patch.status = sessionStatus
    if (currentTaskApplied !== undefined) patch.currentTask = currentTaskApplied
    if (checkpoint !== undefined) {
      patch.checkpoint = {
        ...checkpoint,
        recordedAt: new Date().toISOString(),
      }
    }
    // Pass the project root explicitly to avoid mutating the module-level
    // resolver (concurrent-run race). The handler already holds `projectRoot`.
    const written = writePlanState(slug, patch, projectRoot)
    if (written) {
      sessionStateApplied = patch
    } else {
      logger.warn(
        { slug, patch },
        'update_plan_status: failed to write STATE.json (project root resolver not configured?)',
      )
    }
  }

  if (nextContent === original && !sessionStateApplied) {
    return {
      output: jsonToolResult({
        file: artifactPath,
        message:
          unmatchedTasks.length > 0
            ? `No changes applied. No checklist lines matched: ${unmatchedTasks
                .map((t) => `"${t}"`)
                .join(', ')}.`
            : 'No changes applied.',
      }),
    }
  }

  if (nextContent !== original) {
    const tempPath = `${writePath}.${process.pid}.${Date.now()}.tmp`
    fs.writeFileSync(tempPath, nextContent, 'utf8')
    fs.renameSync(tempPath, writePath)
  }

  // P0.13 — append structured events to EVENTS.jsonl for the `/plan-timeline`
  // CLI. The slug is the session directory basename under `.agents/sessions/`.
  // Events are emitted after the artifact write + STATE.json patch succeed so
  // the log only records mutations that actually landed on disk.
  const eventSessionDir = path.dirname(writePath)
  const eventSlug = path.basename(eventSessionDir)
  if (matchedTasks.length > 0) {
    appendPlanEvent(
      eventSlug,
      {
        kind: 'task_update',
        summary: `Updated ${matchedTasks.length} task line(s): ${matchedTasks.join(', ')}`,
        payload: {
          matched: matchedTasks,
          unmatched: unmatchedTasks.length > 0 ? unmatchedTasks : undefined,
        },
      },
      projectRoot,
    )
  }
  if (appendedHeading) {
    appendPlanEvent(
      eventSlug,
      {
        kind: 'append_lesson',
        summary: `Appended entry "${appendedHeading}" to ${path.basename(writePath)}`,
        payload: {
          heading: appendedHeading,
          artifact: path.basename(writePath),
        },
      },
      projectRoot,
    )
  }
  if (sessionStateApplied?.status) {
    appendPlanEvent(
      eventSlug,
      {
        kind: 'session_status',
        summary: `Session status -> ${sessionStateApplied.status}`,
        payload: { status: sessionStateApplied.status },
      },
      projectRoot,
    )
  }
  if (currentTaskApplied !== undefined) {
    appendPlanEvent(
      eventSlug,
      {
        kind: 'current_task',
        summary: currentTaskApplied
          ? `Current task -> "${currentTaskApplied}"`
          : 'Current task pointer cleared',
        payload: { currentTask: currentTaskApplied },
      },
      projectRoot,
    )
  }

  const messageParts: string[] = []
  if (matchedTasks.length > 0) {
    messageParts.push(`Updated ${matchedTasks.length} task line(s).`)
  }
  if (unmatchedTasks.length > 0) {
    messageParts.push(
      `No match for: ${unmatchedTasks.map((t) => `"${t}"`).join(', ')}.`,
    )
  }
  if (appendedHeading) {
    messageParts.push(`Appended entry "${appendedHeading}".`)
  }
  if (sessionStateApplied?.status) {
    messageParts.push(`Session status -> ${sessionStateApplied.status}.`)
  }
  if (sessionStateApplied?.currentTask !== undefined) {
    messageParts.push(
      sessionStateApplied.currentTask
        ? `Current task -> "${sessionStateApplied.currentTask}".`
        : 'Current task pointer cleared.',
    )
  }

  return {
    output: jsonToolResult({
      file: artifactPath,
      message: messageParts.join(' ') || 'Updated.',
    }),
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>
