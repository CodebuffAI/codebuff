import type { Message } from '@codebuff/common/types/messages/codebuff-message'

export const FILE_EDIT_LOOP_RECOVERY_TAG = 'FILE_EDIT_LOOP_RECOVERY'
export const FILE_EDIT_LOOP_RECOVERY_THRESHOLD = 3
export const FILE_EDIT_LOOP_STOP_THRESHOLD = 6

export const FILE_EDIT_LOOP_RECOVERY_MESSAGE =
  'You have repeatedly sent the same file edit, and every attempt was rejected with the same result. Sending it again will not change anything. Read the file to see its current content, make a different edit, or explain the blocker to the user and end your turn.'

export const FILE_EDIT_LOOP_STOP_MESSAGE =
  'The model got stuck re-sending the same rejected file edit without making progress. This turn was stopped to avoid wasting more of your session. Try a different model or reasoning level, then continue.'

/** The tools whose rejection is reported as an `errorMessage` result: a no-op
 * the handler already explained to the model, so re-sending the same call
 * cannot do anything but earn the same answer.
 *
 * `write_file`, `str_replace` and `create_plan` get it from the
 * `postStreamProcessing` they share. `propose_str_replace` is the review-mode
 * twin of `str_replace` (`agents/base2`, the best-of-n editors) and builds the
 * same `{ file, errorMessage }` itself, in
 * `tools/handlers/tool/propose-str-replace.ts` — so an identical failing
 * proposal loops exactly like a `str_replace` one, and went uncounted here
 * until 2026-10-14.
 *
 * `apply_patch` and `propose_write_file` are deliberately absent, even though
 * `truncated-write-guard.ts`'s `FILE_MUTATING_TOOL_NAMES` lists them: neither
 * ever answers with `errorMessage`, so `isRejectedEdit` could not match one
 * and adding them would only widen the guard's precondition for nothing. */
const FILE_EDIT_LOOP_TOOL_NAMES = [
  'write_file',
  'str_replace',
  'create_plan',
  'propose_str_replace',
]

export function isFileEditLoopTool(toolName: string): boolean {
  return FILE_EDIT_LOOP_TOOL_NAMES.includes(toolName)
}

export class FileEditLoopError extends Error {
  constructor() {
    super(FILE_EDIT_LOOP_STOP_MESSAGE)
    this.name = 'FileEditLoopError'
  }
}

/** A tool result is a rejection when the handler answered with `errorMessage`
 * (content unchanged, old string not found, cut-off rewrite refused). */
function isRejectedEdit(message: Extract<Message, { role: 'tool' }>): boolean {
  if (!Array.isArray(message.content)) return false
  return message.content.some(
    (part) =>
      part.type === 'json' &&
      typeof part.value === 'object' &&
      part.value !== null &&
      typeof (part.value as Record<string, unknown>).errorMessage === 'string',
  )
}

/** The same edit sent with a different `instructions` note is still the same
 * edit: only the path and the content decide what the handler answers. */
function editKey(toolName: string, input: Record<string, unknown>): string {
  const { instructions: _instructions, ...rest } = input
  return JSON.stringify([toolName, rest])
}

/** Count trailing steps of this user turn whose file edits were all the same
 * calls as the step before, and all rejected. Seen 2026-10-08 on Desktop with
 * Solar Pro 4: the model re-sent one unchanged write_file every step, each
 * answered "same as the old content", and only the general step budget stopped
 * it. Prose, reasoning, step prompts and the recovery note are not progress. A
 * different edit, an accepted edit, another tool, or a user message is. Only
 * matched, completed calls count, so a lost result cannot masquerade as this
 * model loop. */
export function trailingIdenticalRejectedEdits(messages: Message[]): number {
  let count = 0
  let latestStep: string | undefined
  const rejected = new Set<string>()

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!
    if (message.role === 'user') {
      if (
        message.tags?.includes('STEP_PROMPT') ||
        message.tags?.includes(FILE_EDIT_LOOP_RECOVERY_TAG)
      ) {
        continue
      }
      break
    }
    if (message.role === 'tool') {
      if (!isFileEditLoopTool(message.toolName) || !isRejectedEdit(message)) {
        break
      }
      rejected.add(message.toolCallId)
      continue
    }
    if (message.role !== 'assistant' || !Array.isArray(message.content))
      continue

    const keys: string[] = []
    for (const part of message.content) {
      if (part.type !== 'tool-call') continue
      if (
        !isFileEditLoopTool(part.toolName) ||
        !rejected.delete(part.toolCallId)
      ) {
        return count
      }
      keys.push(editKey(part.toolName, part.input))
    }
    if (keys.length === 0) continue
    const step = JSON.stringify(keys.sort())
    if (latestStep !== undefined && step !== latestStep) return count
    latestStep = step
    count++
  }

  return count
}
