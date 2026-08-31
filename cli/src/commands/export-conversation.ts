/**
 * `/export [filename]` command — write the entire conversation to a file, with
 * no size ceiling (unlike `/copy`, whose OSC 52 clipboard path caps at 32 KB).
 *
 * Markdown by default (same rendering as `/copy` via serializeConversation);
 * a filename ending in `.json` exports the raw message objects instead, using
 * the persistence-safe serializer so cyclic tool output can't throw.
 *
 * Two guards make this safe to point at a filename: the resolved path must
 * stay inside the project root (path.resolve honors absolute paths and `..`,
 * so an unchecked argument reaches anything on disk), and an existing file is
 * never overwritten — the atomic rename-over-target write would otherwise
 * silently destroy it with the transcript, with no prompt and no backup.
 */

import { existsSync } from 'fs'
import { mkdir } from 'fs/promises'
import * as path from 'path'

import { serializeConversation } from './copy-conversation'
import { getCurrentChatId, getProjectRoot } from '../project-files'
import { useChatStore } from '../state/chat-store'
import { IS_FREEBUFF } from '../utils/constants'
import { getSystemMessage } from '../utils/message-history'
import { serializeForPersistence } from '../utils/safe-json'
import { writeFileAtomicAsync } from '../utils/write-file-atomic'

import type { RouterParams } from './command-registry'
import type { ChatMessage } from '../types/chat'

export interface ExportDeps {
  getProjectRoot: () => string
  getCurrentChatId: () => string
  fileExists: (filePath: string) => boolean
  writeFile: (filePath: string, data: string) => Promise<void>
}

const defaultDeps: ExportDeps = {
  getProjectRoot,
  getCurrentChatId,
  fileExists: existsSync,
  // Async on purpose: a multi-MB transcript flushed synchronously would block
  // the CLI's render/input thread (the same reason writeFileAtomicAsync
  // exists for the checkpoint writer).
  writeFile: async (filePath, data) => {
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFileAtomicAsync(filePath, data)
  },
}

export type ExportResult =
  | { ok: true; filePath: string; format: 'markdown' | 'json' }
  | { ok: false; error: string }

/**
 * Serialize the conversation and write it to disk. `rawArg` is the optional
 * user-supplied filename, resolved relative to the project root; empty means
 * the default `freebuff-chat-<chatId>.md` in the project root.
 */
export async function exportConversation(
  messages: ChatMessage[],
  rawArg: string,
  deps: ExportDeps = defaultDeps,
): Promise<ExportResult> {
  try {
    const projectRoot = deps.getProjectRoot()
    const fileName =
      rawArg.trim() ||
      `${IS_FREEBUFF ? 'freebuff' : 'codebuff'}-chat-${deps.getCurrentChatId()}.md`
    const filePath = path.resolve(projectRoot, fileName)

    // path.resolve honors absolute paths and `..`, so without this check
    // `/export ../../.zshrc` writes outside the project entirely.
    if (path.relative(projectRoot, filePath).startsWith('..')) {
      return {
        ok: false,
        error: `refusing to write outside the project root (${filePath})`,
      }
    }
    // Never clobber: the atomic write renames over the target, so an existing
    // file — `/export README.md` from a slip or tab-complete — would be
    // destroyed with no prompt and no backup.
    if (deps.fileExists(filePath)) {
      return {
        ok: false,
        error: `${filePath} already exists — pass a new filename`,
      }
    }

    const format = filePath.toLowerCase().endsWith('.json')
      ? ('json' as const)
      : ('markdown' as const)
    // Inside the try: a multi-MB transcript can throw from serialization
    // itself (RangeError: Invalid string length), and that must surface as an
    // ExportResult error rather than an unhandled rejection.
    const data =
      format === 'json'
        ? // Persistence-safe: raw messages can smuggle cyclic tool output that
          // would make a plain JSON.stringify throw.
          serializeForPersistence(messages).json
        : // No maxBytes: files have no clipboard ceiling, so nothing is trimmed.
          serializeConversation(messages).text

    await deps.writeFile(filePath, data)
    return { ok: true, filePath, format }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function handleExportConversationCommand(
  params: RouterParams,
  args: string,
): Promise<void> {
  const messages = useChatStore.getState().messages

  params.saveToHistory(params.inputValue.trim())
  params.setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })

  const appendSystemMessage = (content: string) => {
    params.setMessages((prev) => [...prev, getSystemMessage(content)])
  }

  if (messages.length === 0) {
    appendSystemMessage('Nothing to export — the conversation is empty.')
    return
  }

  const result = await exportConversation(messages, args)
  if (!result.ok) {
    appendSystemMessage(`Failed to export conversation: ${result.error}`)
    return
  }

  const count = `${messages.length} message${messages.length === 1 ? '' : 's'}`
  appendSystemMessage(
    `Exported conversation (${count}, ${result.format}) to ${result.filePath}`,
  )
}
