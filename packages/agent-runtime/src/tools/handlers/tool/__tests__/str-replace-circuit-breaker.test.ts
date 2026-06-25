import { describe, expect, it } from 'bun:test'

import { handleStrReplace } from '../str-replace'
import { getFileProcessingValues } from '../write-file'
import {
  encodeReadCapabilityToken,
  getContentHash,
} from '../../../../process-str-replace'

import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

function makeStrReplaceCall(
  input: CodebuffToolCall<'str_replace'>['input'],
): CodebuffToolCall<'str_replace'> {
  return {
    toolName: 'str_replace',
    toolCallId: 'circuit-breaker-call',
    input,
  } as unknown as CodebuffToolCall<'str_replace'>
}

const noopWriteToClient = (_chunk: string) => {}
const emptyRequestClientToolCall = async () =>
  [] as unknown as CodebuffToolOutput<'str_replace'>

describe('handleStrReplace circuit breaker (Fix C)', () => {
  it('returns a circuit-breaker errorMessage when the per-path consecutive-failure counter reaches the limit', async () => {
    const path = 'blocked.ts'
    // STR_REPLACE_MAX_CONSECUTIVE_FAILURES is 3 in source. Pre-set the counter
    // to the limit so the next call is the one that trips the breaker. The
    // breaker fires before any file processing, so the requestOptionalFile stub
    // is never reached.
    const fileProcessingState = getFileProcessingValues({
      consecutiveStrReplaceFailuresByPath: { [path]: 3 },
    })

    const result = await handleStrReplace({
      previousToolCallFinished: Promise.resolve(),
      toolCall: makeStrReplaceCall({
        path,
        atomic: false,
        replacements: [
          {
            oldString: 'const x = 1',
            newString: 'const x = 2',
            allowMultiple: false,
          },
        ],
      }),
      fileProcessingState,
      logger: silentLogger,
      requestClientToolCall: emptyRequestClientToolCall,
      // Never reached because the breaker short-circuits first.
      requestOptionalFile: async () => null,
      writeToClient: noopWriteToClient,
    })

    const value = result.output[0]?.value as
      | { errorMessage?: string }
      | undefined
    expect(value).toBeDefined()
    expect(value?.errorMessage).toMatch(/^str_replace circuit breaker:/)
    expect(value?.errorMessage).toContain(
      'consecutive failed or auto-corrected',
    )
  })

  it('does NOT trip the breaker when the counter is below the limit', async () => {
    const path = 'allowed.ts'
    const fileProcessingState = getFileProcessingValues({
      consecutiveStrReplaceFailuresByPath: { [path]: 2 },
      // Disable strict read-before-edit so the handler reaches processStrReplace
      // (the breaker is the focus of this test, not the read gate).
      strictReadBeforeEdit: false,
    })

    const result = await handleStrReplace({
      previousToolCallFinished: Promise.resolve(),
      toolCall: makeStrReplaceCall({
        path,
        atomic: false,
        replacements: [
          {
            oldString: 'const x = 1',
            newString: 'const x = 2',
            allowMultiple: false,
          },
        ],
      }),
      fileProcessingState,
      logger: silentLogger,
      requestClientToolCall: emptyRequestClientToolCall,
      // No file on disk -> processStrReplace reports "does not exist", which is
      // NOT the circuit-breaker message.
      requestOptionalFile: async () => null,
      writeToClient: noopWriteToClient,
    })

    const value = result.output[0]?.value as
      | { errorMessage?: string; message?: string }
      | undefined
    expect(value).toBeDefined()
    expect(value?.errorMessage).not.toMatch(/^str_replace circuit breaker:/)
  })

  it('clears the counter when a fresh basedOnRead capability is supplied, then succeeds on an exact match', async () => {
    const path = 'cleared.ts'
    const fileContent = 'const x = 1\nconst y = 2\n'
    const fileProcessingState = getFileProcessingValues({
      consecutiveStrReplaceFailuresByPath: { [path]: 3 },
      strictReadBeforeEdit: false,
    })

    // A basedOnRead anchor proves a fresh read, so the handler clears the
    // counter before the breaker check. Because a basedOnRead anchor forces the
    // handler to re-read current disk content (ignoring any prior in-memory
    // edit promise), the small file's content comes straight from the
    // requestOptionalFile stub. processStrReplace then applies an exact match
    // (a clean success with no auto-correct marker), which keeps the counter
    // cleared. The token must be a real minted capability (not a stub string)
    // so decode + hash validation succeed and the handler reaches the exact
    // match path.
    const freshReadToken = encodeReadCapabilityToken({
      startLine: 1,
      endLine: 2,
      hash: getContentHash(fileContent),
    })
    const result = await handleStrReplace({
      previousToolCallFinished: Promise.resolve(),
      toolCall: makeStrReplaceCall({
        path,
        atomic: false,
        replacements: [
          {
            oldString: 'const x = 1',
            newString: 'const x = 2',
            allowMultiple: false,
            basedOnRead: freshReadToken,
          },
        ],
      }),
      fileProcessingState,
      logger: silentLogger,
      requestClientToolCall: emptyRequestClientToolCall,
      requestOptionalFile: async () => fileContent,
      writeToClient: noopWriteToClient,
    })

    const value = result.output[0]?.value as
      | { errorMessage?: string; message?: string }
      | undefined
    expect(value).toBeDefined()
    // Counter was cleared by the fresh basedOnRead anchor, so the circuit
    // breaker message must NOT appear. On a clean success the output carries a
    // `message` (not `errorMessage`), so guard the undefined case before the
    // toMatch matcher (which requires a string input).
    expect(value?.errorMessage ?? '').not.toMatch(/^str_replace circuit breaker:/)
    // A clean exact-match success (no auto-correct marker) leaves the counter
    // cleared.
    expect(fileProcessingState.consecutiveStrReplaceFailuresByPath[path]).toBeUndefined()
  })
})
