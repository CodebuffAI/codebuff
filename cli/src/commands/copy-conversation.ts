/**
 * `/copy` command — serialize the entire conversation (user + assistant text,
 * reasoning, tool calls with their inputs and outputs, sub-agents) into clean
 * Markdown and write it to the system clipboard.
 *
 * Over SSH the clipboard path is OSC 52, which caps the base64 payload at 32 KB
 * (see clipboard.ts). A real back-and-forth easily exceeds that, so when we're on
 * a remote session and the transcript is too large, we progressively drop the
 * largest tool results (then, if still needed, large tool inputs) — replacing each
 * with a short omission note — until it fits. Local sessions use pbcopy/xclip,
 * which have no such limit, so they always copy the full transcript.
 */

import {
  copyTextToClipboard,
  isRemoteSession,
  showClipboardMessage,
} from '../utils/clipboard'
import { useChatStore } from '../state/chat-store'
import { IS_FREEBUFF } from '../utils/constants'

import type { RouterParams } from './command-registry'
import type { ChatMessage, ContentBlock } from '../types/chat'

// OSC 52 caps its base64 payload at 32 KB (clipboard.ts OSC52_MAX_PAYLOAD).
// base64 is ~4/3 of the raw byte count, so the raw-text ceiling is ~24 KB. Leave
// headroom for tmux/screen passthrough wrapping and the message framing.
const OSC52_TEXT_BUDGET_BYTES = 22_000

const byteLen = (text: string): number => Buffer.byteLength(text, 'utf8')

/** Human-friendly tool label, e.g. `read_files` -> `Read Files`. */
function toolDisplayName(toolName: string): string {
  if (toolName === 'list_directory') return 'List Directories'
  return toolName.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

/**
 * Return the longest suffix of `s` that fits in `maxBytes`, cut on a UTF-8
 * codepoint boundary (and a line boundary when one is close by) so the result
 * is valid text. Used as the last-resort fallback when dropping tool bodies
 * still can't get the transcript under the clipboard budget.
 */
function keepTailBytes(s: string, maxBytes: number): string {
  if (maxBytes <= 0) return ''
  const buf = Buffer.from(s, 'utf8')
  if (buf.length <= maxBytes) return s

  let start = buf.length - maxBytes
  // Advance off any UTF-8 continuation byte (0b10xxxxxx) to a codepoint start.
  while (start < buf.length && (buf[start] & 0xc0) === 0x80) start++
  // Prefer cutting at the next line boundary if it's nearby, for cleaner output.
  const nl = buf.indexOf(0x0a, start)
  if (nl !== -1 && nl - start < 200) start = nl + 1
  return buf.toString('utf8', start)
}

/**
 * A segment of the rendered transcript whose body can be dropped to save space.
 * `full` is the normal rendering; `note` is the compact omission replacement.
 */
interface Droppable {
  kind: 'output' | 'input'
  full: string
  note: string
}

type Segment = string | Droppable

const isDroppable = (segment: Segment): segment is Droppable =>
  typeof segment !== 'string'

function fence(content: string, lang = ''): string {
  // Avoid breaking out of the fence if the content itself contains ```.
  const ticks = content.includes('```') ? '````' : '```'
  return `${ticks}${lang}\n${content}\n${ticks}`
}

function renderToolInput(input: unknown): string {
  if (input == null) return ''
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}

/**
 * Tool results are stored as strings; many are a JSON envelope (e.g. the
 * `[{"type":"json","value":{...}}]` shape from terminal/tool calls). Pretty-print
 * when the string parses as JSON so the transcript is readable; otherwise keep
 * the raw text. Returns the fence language to use alongside the body.
 */
function renderToolOutput(output: string): { body: string; lang: string } {
  const trimmed = output.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return { body: JSON.stringify(JSON.parse(trimmed), null, 2), lang: 'json' }
    } catch {
      // Not valid JSON — fall through to raw.
    }
  }
  return { body: output, lang: '' }
}

function roleHeading(message: ChatMessage): string {
  switch (message.variant) {
    case 'user':
      return '## User'
    case 'error':
      return '## Error'
    default:
      return '## Assistant'
  }
}

/**
 * Render a single content block into the segment list. Recurses for sub-agents.
 * Pushes plain strings for fixed text and `Droppable` objects for tool bodies.
 */
function renderBlock(block: ContentBlock, out: Segment[]): void {
  switch (block.type) {
    case 'text': {
      const text = block.content?.trim()
      if (!text) return
      if (block.textType === 'reasoning') {
        // Reasoning as a blockquote so it reads as model thinking, not output.
        const quoted = text
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n')
        out.push(`> _Reasoning_\n${quoted}`)
      } else {
        out.push(text)
      }
      return
    }

    case 'tool': {
      const name = toolDisplayName(block.toolName)
      const inputText = renderToolInput(block.input)
      const hasInput = inputText.trim().length > 0
      const output = block.output ?? ''
      const hasOutput = output.trim().length > 0

      // A tool call with no input and no output (e.g. still running) gets a
      // compact one-liner rather than a header with nothing beneath it.
      if (!hasInput && !hasOutput) {
        out.push(`**🛠 ${name}** _(no input or output)_`)
        return
      }

      out.push(`**🛠 ${name}**`)
      if (hasInput) {
        out.push({
          kind: 'input',
          full: fence(inputText, 'json'),
          note: `_Input omitted (${formatBytes(byteLen(inputText))}) to fit clipboard._`,
        })
      }
      if (hasOutput) {
        const rendered = renderToolOutput(output)
        out.push({
          kind: 'output',
          full: fence(rendered.body, rendered.lang),
          note: `_Result omitted (${formatBytes(byteLen(rendered.body))}) to fit clipboard._`,
        })
      }
      return
    }

    case 'agent': {
      const label = block.agentName || block.agentType
      out.push(`### ⤷ Subagent: ${label}${block.agentName ? ` (${block.agentType})` : ''}`)
      if (block.initialPrompt?.trim()) {
        out.push(`_Prompt:_ ${block.initialPrompt.trim()}`)
      }
      if (block.content?.trim()) {
        out.push(block.content.trim())
      }
      for (const child of block.blocks ?? []) {
        renderBlock(child, out)
      }
      out.push('### ⤶ End subagent')
      return
    }

    case 'plan': {
      if (block.content?.trim()) {
        out.push(`**Plan**\n\n${block.content.trim()}`)
      }
      return
    }

    case 'ask-user': {
      for (const [i, q] of block.questions.entries()) {
        const answer = block.answers?.find((a) => a.questionIndex === i)
        const selected =
          answer?.selectedOptions?.join(', ') ??
          answer?.selectedOption ??
          answer?.otherText ??
          (block.skipped ? '(skipped)' : '(no answer)')
        out.push(`**Question:** ${q.question}\n_Answer:_ ${selected}`)
      }
      return
    }

    case 'image': {
      out.push(`_[image: ${block.filename ?? block.mediaType}]_`)
      return
    }

    case 'agent-list': {
      const names = block.agents.map((a) => a.displayName).join(', ')
      if (names) out.push(`_[available agents: ${names}]_`)
      return
    }

    // mode-divider and html carry no transcript-worthy text.
    default:
      return
  }
}

function renderMessage(message: ChatMessage, out: Segment[]): void {
  out.push(roleHeading(message))

  if (message.blocks?.length) {
    for (const block of message.blocks) {
      renderBlock(block, out)
    }
  } else if (message.content?.trim()) {
    out.push(message.content.trim())
  }

  // Attachments live on the message, not in blocks — note them for context.
  const fileNames = message.fileAttachments?.map((f) => f.filename) ?? []
  const imageNames = message.attachments?.map((a) => a.filename) ?? []
  const textCount = message.textAttachments?.length ?? 0
  if (fileNames.length) out.push(`> Attached files: ${fileNames.join(', ')}`)
  if (imageNames.length) out.push(`> Attached images: ${imageNames.join(', ')}`)
  if (textCount) out.push(`> Attached ${textCount} pasted text snippet(s)`)
}

export interface SerializedConversation {
  text: string
  /** Number of droppable tool bodies omitted to fit the clipboard budget. */
  omittedCount: number
  /** True if the transcript was hard-truncated as a last resort. */
  truncated: boolean
}

const TRUNCATION_MARKER = '_[…earlier conversation truncated to fit clipboard…]_'

/**
 * Serialize the conversation to Markdown. When `maxBytes` is provided and the
 * full transcript exceeds it, the largest tool results (then large tool inputs)
 * are replaced with a short omission note. If that still isn't enough (e.g. a
 * single huge text block), the oldest content is hard-truncated so the copy
 * always fits.
 */
export function serializeConversation(
  messages: ChatMessage[],
  options: { maxBytes?: number } = {},
): SerializedConversation {
  const segments: Segment[] = []
  for (const message of messages) {
    renderMessage(message, segments)
  }

  const product = IS_FREEBUFF ? 'Freebuff' : 'Codebuff'
  const header = `# ${product} conversation\n_${messages.length} message${messages.length === 1 ? '' : 's'}_`
  const prefix = `${header}\n\n---\n\n`

  const assembleBody = (dropped: Set<Droppable>): string =>
    segments
      .map((seg) =>
        isDroppable(seg) ? (dropped.has(seg) ? seg.note : seg.full) : seg,
      )
      .join('\n\n')

  const dropped = new Set<Droppable>()
  let body = assembleBody(dropped)
  let truncated = false

  const { maxBytes } = options
  if (maxBytes) {
    // The body must fit in maxBytes minus the prefix and the trailing newline.
    const bodyBudget = maxBytes - byteLen(prefix) - 1

    if (byteLen(body) > bodyBudget) {
      // Tier 1: drop tool outputs first (the bulk of the noise), then inputs.
      // Within each tier, largest first so we drop as few blocks as possible.
      // Pre-measure savings once rather than recomputing inside the comparator.
      const candidates = segments
        .filter(isDroppable)
        .map((d) => ({ d, save: byteLen(d.full) - byteLen(d.note) }))
        .filter((c) => c.save > 0)
        .sort((a, b) => {
          if (a.d.kind !== b.d.kind) return a.d.kind === 'output' ? -1 : 1
          return b.save - a.save
        })

      const needed = byteLen(body) - bodyBudget
      let saved = 0
      for (const { d, save } of candidates) {
        if (saved >= needed) break
        dropped.add(d)
        saved += save
      }
      body = assembleBody(dropped)
    }

    if (byteLen(body) > bodyBudget) {
      // Tier 2: nothing droppable left to cut (e.g. a giant text block). Keep
      // the most recent content and mark the truncation so the copy never fails.
      const marker = `${TRUNCATION_MARKER}\n\n`
      body = marker + keepTailBytes(body, bodyBudget - byteLen(marker))
      truncated = true
    }
  }

  return { text: `${prefix}${body}\n`, omittedCount: dropped.size, truncated }
}

export async function handleCopyConversationCommand(
  params: RouterParams,
): Promise<void> {
  const messages = useChatStore.getState().messages

  params.saveToHistory(params.inputValue.trim())
  params.setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })

  if (messages.length === 0) {
    showClipboardMessage('Nothing to copy — the conversation is empty.', {
      durationMs: 3000,
    })
    return
  }

  // Only remote sessions are subject to the OSC 52 size cap; local clipboard
  // tools (pbcopy/xclip/clip) handle arbitrarily large transcripts.
  const { text, omittedCount, truncated } = serializeConversation(messages, {
    maxBytes: isRemoteSession() ? OSC52_TEXT_BUDGET_BYTES : undefined,
  })

  const count = `${messages.length} message${messages.length === 1 ? '' : 's'}`
  // omittedCount covers dropped tool outputs and/or inputs, so phrase it as
  // "tool call(s)" rather than specifically "results".
  const trimNotes: string[] = []
  if (omittedCount > 0) {
    trimNotes.push(
      `${omittedCount} large tool call${omittedCount === 1 ? '' : 's'} trimmed`,
    )
  }
  if (truncated) trimNotes.push('older messages truncated')
  const successMessage =
    trimNotes.length > 0
      ? `Copied conversation · ${count} (${trimNotes.join(', ')} to fit clipboard)`
      : `Copied conversation · ${count}`

  try {
    await copyTextToClipboard(text, { successMessage, durationMs: 4000 })
  } catch {
    // copyTextToClipboard already surfaces a failure/guidance message.
  }
}
