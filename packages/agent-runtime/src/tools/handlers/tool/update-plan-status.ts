import * as fs from 'fs'
import * as path from 'path'

import { jsonToolResult } from '@codebuff/common/util/messages'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

type ToolName = 'update_plan_status'

/** Strict shape: optional leading "./" then ".agents/sessions/<slug>/(STATUS|LESSONS).md" */
const ALLOWED_UPDATE_ARTIFACT_RE =
  /^(?:\.\/)?\.agents\/sessions\/([A-Za-z0-9._-]+)\/(STATUS|LESSONS)\.md$/

const CHECKBOX_LINE_RE = /^(\s*[-*]\s*\[)([ xX])(\]\s*)(.*)$/

function normalizeArtifactPath(p: string): string {
  return p.replace(/\\/g, '/')
}

export function validatePlanStatusPath(input: string): string | null {
  if (typeof input !== 'string' || !input.trim()) {
    return 'update_plan_status: path must be a non-empty string.'
  }
  const normalized = normalizeArtifactPath(input.trim())
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    return `update_plan_status: absolute paths are not allowed (got "${input}"). Use .agents/sessions/<slug>/(STATUS|LESSONS).md.`
  }
  if (normalized.split('/').includes('..')) {
    return `update_plan_status: path traversal ("..") is not allowed (got "${input}").`
  }
  if (!ALLOWED_UPDATE_ARTIFACT_RE.test(normalized)) {
    return `update_plan_status: only .agents/sessions/<slug>/(STATUS|LESSONS).md paths are allowed (got "${input}").`
  }
  return null
}

type TaskUpdate = {
  task: string
  completed?: boolean
  note?: string
}

type AppendEntry = {
  heading: string
  body: string
}

/**
 * Apply a single task update to the file's lines. Returns the new lines array
 * and a boolean indicating whether a matching line was found.
 */
export function applyTaskUpdate(
  lines: string[],
  update: TaskUpdate,
): { lines: string[]; matched: boolean } {
  const needle = update.task.toLowerCase()
  const next = lines.slice()
  for (let i = 0; i < next.length; i++) {
    const m = next[i].match(CHECKBOX_LINE_RE)
    if (!m) continue
    const [, prefix, mark, gap, rest] = m
    if (!rest.toLowerCase().includes(needle)) continue

    const newMark =
      update.completed === undefined ? mark : update.completed ? 'x' : ' '
    let newRest = rest
    if (update.note && update.note.trim()) {
      const trimmedNote = update.note.trim()
      const noteSuffix = ` (${trimmedNote})`
      if (!newRest.trimEnd().endsWith(noteSuffix)) {
        newRest = `${newRest.trimEnd()}${noteSuffix}`
      }
    }
    next[i] = `${prefix}${newMark}${gap}${newRest}`
    return { lines: next, matched: true }
  }
  return { lines: next, matched: false }
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
  const { path: artifactPath, updates, append } = toolCall.input

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
    normalizeArtifactPath(artifactPath.trim()),
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

  for (const update of updateList) {
    const result = applyTaskUpdate(lines, update)
    lines = result.lines
    if (result.matched) {
      matchedTasks.push(update.task)
    } else {
      unmatchedTasks.push(update.task)
    }
  }

  let appendedHeading: string | undefined
  if (append) {
    const block = buildAppendBlock(append, new Date().toISOString())
    lines.push(...block.split('\n'))
    appendedHeading = append.heading
  }

  const nextContent = lines.join('\n') + (trailingNewline ? '\n' : '')

  if (nextContent === original) {
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

  const tempPath = `${writePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tempPath, nextContent, 'utf8')
  fs.renameSync(tempPath, writePath)

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

  return {
    output: jsonToolResult({
      file: artifactPath,
      message: messageParts.join(' ') || 'Updated.',
    }),
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>
