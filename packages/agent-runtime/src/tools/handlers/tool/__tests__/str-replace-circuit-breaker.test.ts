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
const confirmedRequestClientToolCall = async (toolCall: any) =>
  [
    {
      type: 'json' as const,
      value: { file: toolCall.input.path, message: 'client confirmed edit' },
    },
  ] as CodebuffToolOutput<'str_replace'>

describe('handleStrReplace circuit breaker (Fix C)', () => {
  it('returns a circuit-breaker errorMessage when the per-path failure budget reaches the limit', async () => {
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
      requestClientToolCall: confirmedRequestClientToolCall,
      // Never reached because the breaker short-circuits first.
      requestOptionalFile: async () => null,
      writeToClient: noopWriteToClient,
    })

    const value = result.output[0]?.value as
      | { errorMessage?: string }
      | undefined
    expect(value).toBeDefined()
    expect(value?.errorMessage).toMatch(/^str_replace circuit breaker:/)
    expect(value?.errorMessage).toContain('failed or auto-corrected')
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
      requestClientToolCall: confirmedRequestClientToolCall,
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

  it('does NOT reset the failure counter when a fresh basedOnRead is supplied — the breaker still trips at the limit', async () => {
    const path = 'not-cleared.ts'
    const fileContent = 'const x = 1\nconst y = 2\n'
    const fileProcessingState = getFileProcessingValues({
      consecutiveStrReplaceFailuresByPath: { [path]: 3 },
      strictReadBeforeEdit: false,
    })

    // Before the fix, a fresh basedOnRead cleared the consecutive-failure
    // counter, so a re-read-and-retry loop that kept failing never tripped the
    // breaker. After the fix, a fresh basedOnRead only clears
    // failedEditRequiresReadByPath (unblocking the edit); the counter is left
    // untouched, so it still trips at the limit and forces the agent to switch
    // tools. The token is a real minted capability so decode + hash validation
    // would succeed and the handler would reach processStrReplace — but the
    // breaker fires first.
    const freshReadToken = encodeReadCapabilityToken({
      startLine: 1,
      endLine: 2,
      hash: getContentHash(fileContent),
      scope: { projectId: '', path, runId: '' },
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
      requestClientToolCall: confirmedRequestClientToolCall,
      requestOptionalFile: async () => fileContent,
      writeToClient: noopWriteToClient,
    })

    const value = result.output[0]?.value as
      | { errorMessage?: string; message?: string }
      | undefined
    expect(value).toBeDefined()
    // The counter is pre-set to the limit and a fresh basedOnRead no longer
    // resets it, so the breaker must trip before any file processing.
    expect(value?.errorMessage).toMatch(/^str_replace circuit breaker:/)
    expect(value?.errorMessage).toContain('failed or auto-corrected')
    // The counter is NOT cleared by the fresh basedOnRead; it stays at the
    // limit.
    expect(fileProcessingState.consecutiveStrReplaceFailuresByPath[path]).toBe(
      3,
    )
  })

  it('trips the breaker after a re-read-and-retry loop of repeated failures even when each retry carries a fresh basedOnRead', async () => {
    // Reproduces the real-world failure mode the fix targets: the agent fails,
    // re-reads (minting a fresh basedOnRead), retries with the SAME broken
    // payload, fails again, re-reads, retries again... Before the fix each
    // fresh basedOnRead reset the counter so this loop never tripped the
    // breaker. After the fix the counter accumulates across re-reads and the
    // breaker fires on the 4th attempt (3 prior failures + this one).
    const path = 'retry-loop.ts'
    const fileContent = 'const x = 1\nconst y = 2\n'
    const fileProcessingState = getFileProcessingValues({
      consecutiveStrReplaceFailuresByPath: { [path]: 2 },
      strictReadBeforeEdit: false,
    })

    const freshReadToken = encodeReadCapabilityToken({
      startLine: 1,
      endLine: 2,
      hash: getContentHash(fileContent),
      scope: { projectId: '', path, runId: '' },
    })
    // An oldString that does NOT exist in the file forces processStrReplace to
    // return a hard error, which increments the counter. The basedOnRead is
    // valid (fresh read) but cannot rescue a wrong oldString.
    const result = await handleStrReplace({
      previousToolCallFinished: Promise.resolve(),
      toolCall: makeStrReplaceCall({
        path,
        atomic: false,
        replacements: [
          {
            oldString: 'const NOT_PRESENT = 999',
            newString: 'const NOT_PRESENT = 1000',
            allowMultiple: false,
            basedOnRead: freshReadToken,
          },
        ],
      }),
      fileProcessingState,
      logger: silentLogger,
      requestClientToolCall: confirmedRequestClientToolCall,
      requestOptionalFile: async () => fileContent,
      writeToClient: noopWriteToClient,
    })

    const value = result.output[0]?.value as
      | { errorMessage?: string; message?: string }
      | undefined
    expect(value).toBeDefined()
    // This is the 3rd consecutive failure (counter was 2, this failure makes
    // it 3). The breaker does NOT trip on this call (it trips when the counter
    // is ALREADY >= 3 at the START of the call), but the counter must now be 3
    // so the NEXT attempt — even with a fresh basedOnRead — will trip it.
    expect(value?.errorMessage ?? '').not.toMatch(
      /^str_replace circuit breaker:/,
    )
    expect(value?.errorMessage).toContain('str_replace retry limit reached')
    expect(fileProcessingState.consecutiveStrReplaceFailuresByPath[path]).toBe(
      3,
    )

    // Second attempt: a fresh basedOnRead re-read, same broken payload. Before
    // the fix the counter would reset to 0 here and the loop would continue
    // forever. After the fix the counter stays at 3 and the breaker trips.
    const freshReadToken2 = encodeReadCapabilityToken({
      startLine: 1,
      endLine: 2,
      hash: getContentHash(fileContent),
      scope: { projectId: '', path, runId: '' },
    })
    const result2 = await handleStrReplace({
      previousToolCallFinished: Promise.resolve(),
      toolCall: makeStrReplaceCall({
        path,
        atomic: false,
        replacements: [
          {
            oldString: 'const NOT_PRESENT = 999',
            newString: 'const NOT_PRESENT = 1000',
            allowMultiple: false,
            basedOnRead: freshReadToken2,
          },
        ],
      }),
      fileProcessingState,
      logger: silentLogger,
      requestClientToolCall: confirmedRequestClientToolCall,
      requestOptionalFile: async () => fileContent,
      writeToClient: noopWriteToClient,
    })

    const value2 = result2.output[0]?.value as
      | { errorMessage?: string; message?: string }
      | undefined
    expect(value2).toBeDefined()
    expect(value2?.errorMessage).toMatch(/^str_replace circuit breaker:/)
    // The breaker message must direct the agent to switch tools, which is the
    // whole point of breaking the loop.
    expect(value2?.errorMessage).toContain('rewrite_symbol')
    // Counter is unchanged by the tripped attempt (the breaker returns before
    // any processing that would increment it).
    expect(fileProcessingState.consecutiveStrReplaceFailuresByPath[path]).toBe(
      3,
    )
  })

  it('does not erase prior failures after an exact-match success', async () => {
    const path = 'alternating-loop.ts'
    const fileContent = 'const x = 1\nconst y = 2\n'
    const fileProcessingState = getFileProcessingValues({
      consecutiveStrReplaceFailuresByPath: { [path]: 1 },
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
      requestClientToolCall: confirmedRequestClientToolCall,
      requestOptionalFile: async () => fileContent,
      writeToClient: noopWriteToClient,
    })

    const value = result.output[0]?.value as
      | { errorMessage?: string; message?: string }
      | undefined
    expect(value?.errorMessage).toBeUndefined()
    expect(fileProcessingState.consecutiveStrReplaceFailuresByPath[path]).toBe(
      1,
    )
  })

  it('charges the failure budget for a non-atomic partial success', async () => {
    const path = 'partial-loop.ts'
    const fileContent = 'const x = 1\nconst y = 2\n'
    const fileProcessingState = getFileProcessingValues({
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
          {
            oldString: 'const missing = 1',
            newString: 'const missing = 2',
            allowMultiple: false,
          },
        ],
      }),
      fileProcessingState,
      logger: silentLogger,
      requestClientToolCall: confirmedRequestClientToolCall,
      requestOptionalFile: async () => fileContent,
      writeToClient: noopWriteToClient,
    })

    const value = result.output[0]?.value as
      | { errorMessage?: string; message?: string }
      | undefined
    expect(value?.errorMessage).toBeUndefined()
    expect(value?.message).toContain('Partial str_replace applied')
    expect(fileProcessingState.consecutiveStrReplaceFailuresByPath[path]).toBe(
      1,
    )
  })
})
