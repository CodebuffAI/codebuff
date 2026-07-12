import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { FILE_READ_STATUS } from '@codebuff/common/constants/paths'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { describe, expect, it } from 'bun:test'

import { handleEditTransaction } from '../tools/handlers/tool/edit-transaction'
import { handleReadFiles } from '../tools/handlers/tool/read-files'
import { handleReplaceRange } from '../tools/handlers/tool/replace-range'
import { handleStrReplace } from '../tools/handlers/tool/str-replace'
import { handleWriteFile } from '../tools/handlers/tool/write-file'
import {
  encodeReadCapabilityToken,
  getContentHash,
} from '../process-str-replace'
import { processStream } from '../tools/stream-parser'
import { createMockStreamWithToolCalls, mockFileContext } from './test-utils'

import type { FileProcessingState } from '../tools/handlers/tool/write-file'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { AgentTemplate } from '../templates/types'

const logger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

function createFileProcessingState(): FileProcessingState {
  return {
    promisesByPath: {},
    allPromises: [],
    fileChangeErrors: [],
    fileChanges: [],
    firstFileProcessed: false,
    failedEditRequiresReadByPath: {},
    consecutiveStrReplaceFailuresByPath: {},
  }
}

function confirmedMutationOutput(toolCall: any) {
  const changes = Array.isArray(toolCall.input)
    ? toolCall.input
    : [toolCall.input]
  return [
    {
      type: 'json' as const,
      value: {
        kind: 'file_mutation_result',
        version: 1,
        operationId: toolCall.toolCallId,
        outcome: 'applied',
        actions: changes.map((change: any, index: number) => ({
          actionId: `${toolCall.toolCallId}:${index}`,
          index,
          action:
            change.type === 'delete' || change.type === 'move'
              ? change.type
              : change.expectedHash === null
                ? 'create'
                : 'update',
          path: change.path,
          ...(change.destinationPath
            ? { destinationPath: change.destinationPath }
            : {}),
          outcome: 'applied',
          beforeHash: change.expectedHash ?? 'before',
          afterHash: change.type === 'delete' ? null : 'after',
        })),
        authorityTier: 'portable_path',
        receiptId: toolCall.toolCallId,
        errors: [],
        freshCapabilities: [],
      },
    },
  ]
}

describe('read_files edit-state recovery', () => {
  it('[PERF-L05] caps transaction snapshot reads at eight concurrent paths', async () => {
    const paths = Array.from(
      { length: 10 },
      (_, index) => `src/file-${index}.ts`,
    )
    const fileProcessingState = createFileProcessingState()
    let releaseSnapshots!: () => void
    const snapshotGate = new Promise<void>((resolve) => {
      releaseSnapshots = resolve
    })
    let active = 0
    let maxActive = 0
    let started = 0

    const transactionPromise = handleEditTransaction({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'bounded-snapshots',
        toolName: 'edit_transaction',
        input: {
          edits: paths.map((path) => ({
            type: 'str_replace' as const,
            path,
            replacements: [
              {
                oldString: 'export const value = 1',
                newString: 'export const value = 2',
                allowMultiple: false,
              },
            ],
          })),
        },
      },
      fileProcessingState,
      logger,
      requestOptionalFile: async () => {
        started += 1
        active += 1
        maxActive = Math.max(maxActive, active)
        await snapshotGate
        active -= 1
        return 'export const value = 1\n'
      },
      requestClientToolCall: async () => [
        {
          type: 'json' as const,
          value: { message: 'applied transaction batch', files: [] },
        },
      ],
    } as any)

    while (started < 8) await Promise.resolve()
    expect(started).toBe(8)
    expect(maxActive).toBe(8)
    releaseSnapshots()

    await transactionPromise
    expect(started).toBe(10)
    expect(maxActive).toBe(8)
  })

  it('normalizes leading dot-slash paths before rendering read results', async () => {
    const path = 'scripts/check-tool-registration.ts'
    const diskContent = '#!/usr/bin/env bun\n'
    const fileProcessingState = createFileProcessingState()
    fileProcessingState.failedEditRequiresReadByPath[path] = true
    fileProcessingState.promisesByPath[path] = [
      Promise.resolve({
        tool: 'write_file' as const,
        path,
        toolCallId: 'stale-write',
        content: diskContent,
        messages: [],
      }),
    ]

    const result = await handleReadFiles({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'read-dot-slash',
        toolName: 'read_files',
        input: {
          paths: [`./${path}`],
        },
      },
      fileContext: mockFileContext,
      fileProcessingState,
      requestFiles: async ({ filePaths }: { filePaths: string[] }) =>
        Object.fromEntries(
          filePaths.map((filePath) => [
            filePath,
            filePath === path ? diskContent : null,
          ]),
        ),
      logger,
    } as any)

    expect(
      fileProcessingState.failedEditRequiresReadByPath[path],
    ).toBeUndefined()
    expect(fileProcessingState.promisesByPath[path]).toBeUndefined()

    expect(result.output[0]?.type).toBe('json')
    if (result.output[0]?.type === 'json') {
      const value = result.output[0].value as any
      expect(value.summary).toEqual({
        ok: 1,
        partial: 0,
        failed: 0,
        requested: 1,
        uniquePaths: 1,
      })
      // Empty referencedBy is omitted from the rendered file entry now (M7c).
      // The file content carries the M4 "changed since last read" prefix
      // because there was a stale promisesByPath entry simulating a prior edit.
      expect(value.results[0]).toMatchObject({ path, selector: 'file' })
      expect(value.results[0].referencedBy).toBeUndefined()
      expect(value.results[0].content).toContain('changed since last read')
      expect(value.results[0].content).toContain(diskContent)
    }
  })

  it('does not clear failed-edit gate or grant authorization when read_files cannot load the file', async () => {
    const path = 'src/missing.ts'
    const fileProcessingState = createFileProcessingState()
    fileProcessingState.strictReadBeforeEdit = true
    fileProcessingState.failedEditRequiresReadByPath[path] = true
    fileProcessingState.promisesByPath[path] = [
      Promise.resolve({
        tool: 'str_replace' as const,
        path,
        toolCallId: 'failed-edit',
        error: 'previous failed edit',
      }),
    ]

    const result = await handleReadFiles({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'read-missing-file',
        toolName: 'read_files',
        input: { paths: [path] },
      },
      fileContext: mockFileContext,
      fileProcessingState,
      requestFiles: async ({ filePaths }: { filePaths: string[] }) =>
        Object.fromEntries(filePaths.map((filePath) => [filePath, null])),
      logger,
    } as any)

    expect(result.output[0]?.type).toBe('json')
    expect(fileProcessingState.failedEditRequiresReadByPath[path]).toBe(true)
    expect(fileProcessingState.promisesByPath[path]).toHaveLength(1)
    expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBeUndefined()
  })

  it('does not treat an SDK file-read failure marker as a successful read', async () => {
    const path = 'src/blocked.ts'
    const fileProcessingState = createFileProcessingState()
    fileProcessingState.strictReadBeforeEdit = true
    fileProcessingState.failedEditRequiresReadByPath[path] = true
    fileProcessingState.promisesByPath[path] = [
      Promise.resolve({
        tool: 'str_replace' as const,
        path,
        toolCallId: 'failed-edit',
        error: 'previous failed edit',
      }),
    ]

    const result = await handleReadFiles({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'read-blocked-file',
        toolName: 'read_files',
        input: { paths: [path] },
      },
      fileContext: mockFileContext,
      fileProcessingState,
      requestFiles: async () => ({ [path]: FILE_READ_STATUS.IGNORED }),
      logger,
    } as any)

    expect(fileProcessingState.failedEditRequiresReadByPath[path]).toBe(true)
    expect(fileProcessingState.promisesByPath[path]).toHaveLength(1)
    expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBeUndefined()
    expect(result.output[0]?.type).toBe('json')
    if (result.output[0]?.type === 'json') {
      const value = result.output[0].value as any
      expect(value.summary).toEqual({
        ok: 0,
        partial: 0,
        failed: 1,
        requested: 1,
        uniquePaths: 1,
      })
      expect(value.results[0]).toMatchObject({
        path,
        status: 'error',
        error: { code: 'blocked' },
      })
    }
  })

  it('symbol-only read clears the failed-edit gate without granting whole-file authorization', async () => {
    const path = 'src/symbols.ts'
    const diskContent = 'export function target() {\n  return 1\n}\n'
    const fileProcessingState = createFileProcessingState()
    fileProcessingState.strictReadBeforeEdit = true
    fileProcessingState.failedEditRequiresReadByPath[path] = true
    fileProcessingState.promisesByPath[path] = [
      Promise.resolve({
        tool: 'str_replace' as const,
        path,
        toolCallId: 'failed-edit',
        error: 'previous failed edit',
      }),
    ]

    const result = await handleReadFiles({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'read-symbol-only',
        toolName: 'read_files',
        input: { symbols: [{ path, names: ['target'] }] },
      },
      fileContext: mockFileContext,
      fileProcessingState,
      requestFiles: async ({ filePaths }: { filePaths: string[] }) =>
        Object.fromEntries(filePaths.map((filePath) => [filePath, null])),
      requestOptionalFile: async ({ filePath }: { filePath: string }) =>
        filePath === path ? diskContent : null,
      logger,
    } as any)

    expect(result.output[0]?.type).toBe('json')
    expect(
      fileProcessingState.failedEditRequiresReadByPath[path],
    ).toBeUndefined()
    expect(fileProcessingState.promisesByPath[path]).toBeUndefined()
    expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBeUndefined()
  })

  it('does not authorize a file when a symbol-only read finds no requested symbol', async () => {
    const path = 'src/symbols.ts'
    const diskContent = 'export function other() {\n  return 1\n}\n'
    const fileProcessingState = createFileProcessingState()
    fileProcessingState.strictReadBeforeEdit = true
    fileProcessingState.failedEditRequiresReadByPath[path] = true

    const result = await handleReadFiles({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'read-missing-symbol',
        toolName: 'read_files',
        input: { symbols: [{ path, names: ['target'] }] },
      },
      fileContext: mockFileContext,
      fileProcessingState,
      requestFiles: async () => ({}),
      requestOptionalFile: async () => diskContent,
      logger,
    } as any)

    expect(fileProcessingState.failedEditRequiresReadByPath[path]).toBe(true)
    expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBeUndefined()
    expect(result.output[0]?.type).toBe('json')
    if (result.output[0]?.type === 'json') {
      const value = result.output[0].value as any
      expect(value.results).toContainEqual(
        expect.objectContaining({
          path,
          selector: 'symbols',
          status: 'error',
          error: expect.objectContaining({
            code: 'no_match',
            message: expect.stringContaining(
              'None of the requested symbols were found',
            ),
          }),
        }),
      )
      expect(value.summary).toEqual({
        requested: 1,
        ok: 0,
        partial: 0,
        failed: 1,
        uniquePaths: 1,
      })
    }
  })

  it('does not grant whole-file authorization from a canonical truncated read', async () => {
    const path = 'src/large.ts'
    const fileProcessingState = createFileProcessingState()
    fileProcessingState.strictReadBeforeEdit = true

    const result = await handleReadFiles({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'read-truncated-canonical',
        toolName: 'read_files',
        input: { paths: [path] },
      },
      fileContext: mockFileContext,
      fileProcessingState,
      requestFiles: async () => ({
        kind: 'read_files_result' as const,
        version: 1 as const,
        status: 'partial' as const,
        summary: {
          requested: 1,
          ok: 0,
          partial: 1,
          failed: 0,
          uniquePaths: 1,
        },
        results: [
          {
            selector: 'file' as const,
            requestIndex: 0,
            path,
            status: 'partial' as const,
            content: 'visible excerpt',
            complete: false,
            template: false,
            truncation: { reason: 'character_limit' as const },
          },
        ],
      }),
      logger,
    } as any)

    expect(result.output[0]?.type).toBe('json')
    expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBeUndefined()
    expect(
      fileProcessingState.readAuthorizationHashesByPath?.[path],
    ).toBeUndefined()
  })

  it('rejects a canonical result whose selector path does not match the request', async () => {
    const requestedPath = 'src/requested.ts'
    const fileProcessingState = createFileProcessingState()
    fileProcessingState.strictReadBeforeEdit = true

    const result = await handleReadFiles({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'read-mismatched-canonical',
        toolName: 'read_files',
        input: { paths: [requestedPath] },
      },
      fileContext: mockFileContext,
      fileProcessingState,
      requestFiles: async () => ({
        kind: 'read_files_result' as const,
        version: 1 as const,
        status: 'ok' as const,
        summary: {
          requested: 1,
          ok: 1,
          partial: 0,
          failed: 0,
          uniquePaths: 1,
        },
        results: [
          {
            selector: 'file' as const,
            requestIndex: 0,
            path: 'src/unrequested.ts',
            status: 'ok' as const,
            content: 'secret',
            complete: true,
            template: false,
          },
        ],
      }),
      logger,
    } as any)

    expect(fileProcessingState.readAuthorizationsByPath).toBeUndefined()
    expect(result.output[0]?.type).toBe('json')
    if (result.output[0]?.type === 'json') {
      expect(result.output[0].value).toMatchObject({
        status: 'error',
        results: [
          {
            path: requestedPath,
            status: 'error',
            error: { code: 'invalid_request' },
          },
        ],
      })
    }
  })

  it('does not turn a range-only read into whole-file authorization', async () => {
    const path = 'src/ranged.ts'
    const fileProcessingState = createFileProcessingState()
    fileProcessingState.strictReadBeforeEdit = true

    await handleReadFiles({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'read-range-only',
        toolName: 'read_files',
        input: { ranges: [{ path, startLine: 1, endLine: 2 }] },
      },
      fileContext: mockFileContext,
      fileProcessingState,
      requestFiles: async () => ({
        [path]:
          '[RANGE_BLOCK lines 1-2 of 2 in src/ranged.ts; rangeHash=sha256:test; readCapability=cap.test]\n1\tline 1\n2\tline 2',
      }),
      logger,
    } as any)

    expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBeUndefined()
  })

  it('rejects str_replace when the client returns no application result', async () => {
    const path = 'src/helper.ts'
    const diskContent = 'export const value = 1\n'
    const fileProcessingState = createFileProcessingState()
    const appliedPatches: string[] = []

    const result = await handleStrReplace({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'empty-client-result-replace',
        toolName: 'str_replace',
        input: {
          path,
          replacements: [
            {
              oldString: 'export const value = 1',
              newString: 'export const value = 2',
              allowMultiple: false,
            },
          ],
        },
      },
      fileProcessingState,
      logger,
      requestOptionalFile: async ({ filePath }: { filePath: string }) =>
        filePath === path ? diskContent : null,
      requestClientToolCall: async (toolCall: any) => {
        appliedPatches.push(toolCall.input.content)
        return []
      },
      writeToClient: () => {},
    } as any)

    expect(appliedPatches).toHaveLength(1)
    expect(result.output[0]?.type).toBe('json')
    if (result.output[0]?.type === 'json') {
      const value = result.output[0].value as {
        file?: string
        errorMessage?: string
      }
      expect(value.file).toBe(path)
      expect(value.errorMessage).toContain('could not confirm')
    }
    expect(fileProcessingState.failedEditRequiresReadByPath[path]).toBe(true)
    expect(fileProcessingState.promisesByPath[path]).toBeUndefined()
  })

  it('invalidates prepared str_replace state when the client rejects the patch', async () => {
    const path = 'src/rejected.ts'
    const diskContent = 'export const value = 1\n'
    const fileProcessingState = createFileProcessingState()

    const result = await handleStrReplace({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'rejected-client-replace',
        toolName: 'str_replace',
        input: {
          path,
          replacements: [
            {
              oldString: 'export const value = 1',
              newString: 'export const value = 2',
              allowMultiple: false,
            },
          ],
        },
      },
      fileProcessingState,
      logger,
      requestOptionalFile: async () => diskContent,
      requestClientToolCall: async () => [
        {
          type: 'json' as const,
          value: { file: path, errorMessage: 'client rejected patch' },
        },
      ],
      writeToClient: () => {},
    } as any)

    expect(result.output[0]?.type).toBe('json')
    if (result.output[0]?.type === 'json') {
      expect(result.output[0].value).toMatchObject({
        file: path,
        errorMessage: 'client rejected patch',
      })
    }
    expect(fileProcessingState.failedEditRequiresReadByPath[path]).toBe(true)
    expect(fileProcessingState.promisesByPath[path]).toBeUndefined()
  })

  it('[ABI-M05] sends exact whole-file bytes and rejects an unconfirmed client result', async () => {
    const path = 'notes/exact-write.txt'
    const diskContent = 'old\n'
    const newContent = '\n```text\r\nfirst\nsecond\r\n```'
    const fileProcessingState = createFileProcessingState()
    const clientInputs: Array<{
      type: string
      path: string
      content: string
      expectedHash?: string | null
    }> = []

    const result = await handleWriteFile({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'empty-client-result-write',
        toolName: 'write_file',
        input: {
          path,
          content: newContent,
        },
      },
      agentState: { messageHistory: [] },
      clientSessionId: 'test-session',
      fileProcessingState,
      fingerprintId: 'test-fingerprint',
      logger,
      prompt: undefined,
      userId: undefined,
      userInputId: 'test-input',
      requestOptionalFile: async ({ filePath }: { filePath: string }) =>
        filePath === path ? diskContent : null,
      requestClientToolCall: async (toolCall: any) => {
        clientInputs.push(toolCall.input)
        return []
      },
      writeToClient: () => {},
    } as any)

    expect(clientInputs).toEqual([
      {
        type: 'file',
        path,
        content: newContent,
        expectedHash: getContentHash(diskContent),
      },
    ])
    expect(result.output[0]?.type).toBe('json')
    if (result.output[0]?.type === 'json') {
      const value = result.output[0].value as {
        file?: string
        errorMessage?: string
      }
      expect(value.file).toBe(path)
      expect(value.errorMessage).toContain('could not confirm')
    }
    expect(fileProcessingState.failedEditRequiresReadByPath[path]).toBe(true)
    expect(fileProcessingState.promisesByPath[path]).toBeUndefined()
  })

  it('does not grant write authorization or retain prepared state when the client rejects write_file', async () => {
    const path = 'src/rejected-write.ts'
    const diskContent = 'export const value = 1\n'
    const fileProcessingState = createFileProcessingState()
    fileProcessingState.strictReadBeforeEdit = true
    fileProcessingState.readAuthorizationsByPath = { [path]: true }
    fileProcessingState.readAuthorizationHashesByPath = {
      [path]: getContentHash(diskContent),
    }

    const result = await handleWriteFile({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'rejected-client-write',
        toolName: 'write_file',
        input: {
          path,
          content: 'export const value = 2\n',
        },
      },
      agentState: { messageHistory: [] },
      clientSessionId: 'test-session',
      fileProcessingState,
      fingerprintId: 'test-fingerprint',
      logger,
      prompt: undefined,
      userId: undefined,
      userInputId: 'test-input',
      requestOptionalFile: async () => diskContent,
      requestClientToolCall: async () => [
        {
          type: 'json' as const,
          value: { file: path, errorMessage: 'client rejected write' },
        },
      ],
      writeToClient: () => {},
    } as any)

    expect(result.output[0]?.type).toBe('json')
    if (result.output[0]?.type === 'json') {
      expect(result.output[0].value).toMatchObject({
        file: path,
        errorMessage: 'client rejected write',
      })
    }
    expect(fileProcessingState.failedEditRequiresReadByPath[path]).toBe(true)
    expect(fileProcessingState.promisesByPath[path]).toBeUndefined()
    expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBeUndefined()
    expect(
      fileProcessingState.readAuthorizationHashesByPath?.[path],
    ).toBeUndefined()
  })

  it('detects a write_file client error in any output part and revokes authorization', async () => {
    const path = 'src/rejected-late-write.ts'
    const fileProcessingState = createFileProcessingState()
    fileProcessingState.strictReadBeforeEdit = true
    fileProcessingState.readAuthorizationsByPath = { [path]: true }

    const result = await handleWriteFile({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'late-client-error-write',
        toolName: 'write_file',
        input: { path, content: 'export const value = 2\n' },
      },
      agentState: { messageHistory: [] },
      clientSessionId: 'test-session',
      fileProcessingState,
      fingerprintId: 'test-fingerprint',
      logger,
      prompt: undefined,
      userId: undefined,
      userInputId: 'test-input',
      requestOptionalFile: async () => null,
      requestClientToolCall: async () => [
        {
          type: 'json' as const,
          value: { file: path, message: 'prepared' },
        },
        {
          type: 'json' as const,
          value: { file: path, errorMessage: 'late client rejection' },
        },
      ],
      writeToClient: () => {},
    } as any)

    expect(result.output).toHaveLength(2)
    expect(fileProcessingState.failedEditRequiresReadByPath[path]).toBe(true)
    expect(fileProcessingState.promisesByPath[path]).toBeUndefined()
    expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBeUndefined()
  })

  it('registers write_file processing before waiting for previous tool completion', async () => {
    const path = 'packages/agent-runtime/src/util/render-read-files-result.ts'
    const diskContent = 'export const value = 1\n'
    const newContent = 'export const value = 2\n'
    const fileProcessingState = createFileProcessingState()
    const appliedPatches: string[] = []
    let optionalFileReadCount = 0
    let releasePreviousTool!: () => void
    const previousToolCallFinished = new Promise<void>((resolve) => {
      releasePreviousTool = resolve
    })

    const resultPromise = handleWriteFile({
      previousToolCallFinished,
      toolCall: {
        toolCallId: 'queued-write-before-previous-finished',
        toolName: 'write_file',
        input: {
          path,
          content: newContent,
        },
      },
      agentState: { messageHistory: [] },
      clientSessionId: 'test-session',
      fileProcessingState,
      fingerprintId: 'test-fingerprint',
      logger,
      prompt: undefined,
      userId: undefined,
      userInputId: 'test-input',
      requestOptionalFile: async ({ filePath }: { filePath: string }) => {
        optionalFileReadCount += 1
        return filePath === path ? diskContent : null
      },
      requestClientToolCall: async (toolCall: any) => {
        appliedPatches.push(toolCall.input.content)
        return [
          {
            type: 'json' as const,
            value: { file: path, message: 'write confirmed' },
          },
        ]
      },
      writeToClient: () => {},
    } as any)

    expect(fileProcessingState.allPromises).toHaveLength(1)
    expect(fileProcessingState.promisesByPath[path]).toHaveLength(1)
    expect(appliedPatches).toHaveLength(0)
    expect(optionalFileReadCount).toBe(0)

    releasePreviousTool()
    const result = await resultPromise

    expect(appliedPatches).toHaveLength(1)
    expect(optionalFileReadCount).toBe(1)
    expect(result.output[0]?.type).toBe('json')
    if (result.output[0]?.type === 'json') {
      const value = result.output[0].value as {
        file?: string
        message?: string
      }
      expect(value.file).toBe(path)
      expect(value.message).toBe('write confirmed')
    }
  })

  it('does not deadlock when two same-path write_file calls are queued before the first finishes', async () => {
    const path = 'packages/agent-runtime/src/util/render-read-files-result.ts'
    const diskContent = 'export const value = 1\n'
    const firstContent = 'export const value = 2\n'
    const secondContent = 'export const value = 3\n'
    const fileProcessingState = createFileProcessingState()
    const appliedPatches: string[] = []
    let optionalFileReadCount = 0

    const firstResultPromise = handleWriteFile({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'same-path-first-write',
        toolName: 'write_file',
        input: {
          path,
          content: firstContent,
        },
      },
      agentState: { messageHistory: [] },
      clientSessionId: 'test-session',
      fileProcessingState,
      fingerprintId: 'test-fingerprint',
      logger,
      prompt: undefined,
      userId: undefined,
      userInputId: 'test-input',
      requestOptionalFile: async ({ filePath }: { filePath: string }) => {
        optionalFileReadCount += 1
        return filePath === path ? diskContent : null
      },
      requestClientToolCall: async (toolCall: any) => {
        appliedPatches.push(toolCall.input.content)
        return [
          {
            type: 'json' as const,
            value: { file: path, message: 'first write confirmed' },
          },
        ]
      },
      writeToClient: () => {},
    } as any)

    const secondResultPromise = handleWriteFile({
      previousToolCallFinished: firstResultPromise.then(() => {}),
      toolCall: {
        toolCallId: 'same-path-second-write',
        toolName: 'write_file',
        input: {
          path,
          content: secondContent,
        },
      },
      agentState: { messageHistory: [] },
      clientSessionId: 'test-session',
      fileProcessingState,
      fingerprintId: 'test-fingerprint',
      logger,
      prompt: undefined,
      userId: undefined,
      userInputId: 'test-input',
      requestOptionalFile: async () => {
        optionalFileReadCount += 1
        throw new Error(
          'second same-path write_file must reuse prior edit content',
        )
      },
      requestClientToolCall: async (toolCall: any) => {
        appliedPatches.push(toolCall.input.content)
        return [
          {
            type: 'json' as const,
            value: { file: path, message: 'second write confirmed' },
          },
        ]
      },
      writeToClient: () => {},
    } as any)

    expect(fileProcessingState.allPromises).toHaveLength(2)
    expect(fileProcessingState.promisesByPath[path]).toHaveLength(2)

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('same-path write_file deadlocked')),
        100,
      ),
    )
    const [firstResult, secondResult] = await Promise.race([
      Promise.all([firstResultPromise, secondResultPromise]),
      timeout,
    ])

    expect(optionalFileReadCount).toBe(1)
    expect(appliedPatches).toHaveLength(2)
    expect(firstResult.output[0]?.type).toBe('json')
    expect(secondResult.output[0]?.type).toBe('json')
    if (firstResult.output[0]?.type === 'json') {
      expect(firstResult.output[0].value).toMatchObject({ file: path })
    }
    if (secondResult.output[0]?.type === 'json') {
      expect(secondResult.output[0].value).toMatchObject({ file: path })
    }
  })

  it('chains edit_transaction from prior same-step str_replace in-memory content', async () => {
    const path = 'src/helper.ts'
    const diskContent = 'export const value = 1\nexport const other = 1\n'
    const fileProcessingState = createFileProcessingState()
    const appliedPatches: string[] = []

    const strReplaceResult = await handleStrReplace({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'replace-before-transaction',
        toolName: 'str_replace',
        input: {
          path,
          replacements: [
            {
              oldString: 'export const value = 1',
              newString: 'export const value = 2',
              allowMultiple: false,
            },
          ],
        },
      },
      fileProcessingState,
      logger,
      requestOptionalFile: async ({ filePath }: { filePath: string }) =>
        filePath === path ? diskContent : null,
      requestClientToolCall: async (toolCall: any) => {
        appliedPatches.push(toolCall.input.content)
        return confirmedMutationOutput(toolCall)
      },
      writeToClient: () => {},
    } as any)

    expect(strReplaceResult.output[0]?.type).toBe('json')

    const transactionResult = await handleEditTransaction({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'transaction-after-replace',
        toolName: 'edit_transaction',
        input: {
          edits: [
            {
              id: 'update-value-again',
              type: 'str_replace',
              path,
              replacements: [
                {
                  oldString: 'export const value = 2',
                  newString: 'export const value = 3',
                  allowMultiple: false,
                },
              ],
            },
          ],
        },
      },
      fileProcessingState,
      logger,
      requestOptionalFile: async ({ filePath }: { filePath: string }) =>
        filePath === path ? diskContent : null,
      requestClientToolCall: async (toolCall: any) => {
        appliedPatches.push(toolCall.input[0].content)
        return confirmedMutationOutput(toolCall)
      },
    } as any)

    const output = transactionResult.output[0]
    expect(output.type).toBe('json')
    if (output.type === 'json') {
      expect(output.value).not.toHaveProperty('errorMessage')
      expect(appliedPatches[0]).toContain('+export const value = 2')
      expect(appliedPatches[1]).toContain('-export const value = 2')
      expect(appliedPatches[1]).toContain('+export const value = 3')
    }
  })

  it('chains later str_replace calls from edit_transaction in-memory content', async () => {
    const path = 'src/helper.ts'
    const diskContent = 'export const value = 1\nexport const other = 1\n'
    const fileProcessingState = createFileProcessingState()
    const appliedPatches: string[] = []

    const transactionResult = await handleEditTransaction({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'transaction-1',
        toolName: 'edit_transaction',
        input: {
          edits: [
            {
              id: 'update-value',
              type: 'str_replace',
              path,
              replacements: [
                {
                  oldString: 'export const value = 1',
                  newString: 'export const value = 2',
                  allowMultiple: false,
                },
              ],
            },
          ],
        },
      },
      fileProcessingState,
      logger,
      requestOptionalFile: async ({ filePath }: { filePath: string }) =>
        filePath === path ? diskContent : null,
      requestClientToolCall: async (toolCall: any) => {
        appliedPatches.push(toolCall.input[0].content)
        return confirmedMutationOutput(toolCall)
      },
    } as any)

    expect(transactionResult.output[0]?.type).toBe('json')
    expect(fileProcessingState.promisesByPath[path]).toHaveLength(1)

    const strReplaceResult = await handleStrReplace({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'replace-after-transaction',
        toolName: 'str_replace',
        input: {
          path,
          replacements: [
            {
              oldString: 'export const value = 2',
              newString: 'export const value = 3',
              allowMultiple: false,
            },
          ],
        },
      },
      fileProcessingState,
      logger,
      requestOptionalFile: async ({ filePath }: { filePath: string }) =>
        filePath === path ? diskContent : null,
      requestClientToolCall: async (toolCall: any) => {
        appliedPatches.push(toolCall.input.content)
        return [
          {
            type: 'json' as const,
            value: {
              file: toolCall.input.path,
              message: 'applied str_replace patch',
            },
          },
        ]
      },
      writeToClient: () => {},
    } as any)

    const output = strReplaceResult.output[0]
    expect(output.type).toBe('json')
    if (output.type === 'json') {
      expect(output.value).not.toHaveProperty('errorMessage')
      expect(appliedPatches[0]).toContain('+export const value = 2')
      expect(appliedPatches[1]).toContain('-export const value = 2')
      expect(appliedPatches[1]).toContain('+export const value = 3')
    }
  })

  it('blocks later str_replace calls after edit_transaction preflight fails', async () => {
    const path = 'src/helper.ts'
    const diskContent = 'export const value = 1\n'
    const fileProcessingState = createFileProcessingState()

    const transactionResult = await handleEditTransaction({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'transaction-preflight-failed',
        toolName: 'edit_transaction',
        input: {
          edits: [
            {
              type: 'str_replace',
              path,
              replacements: [
                {
                  oldString: 'export const missing = 1',
                  newString: 'export const missing = 2',
                  allowMultiple: false,
                },
              ],
            },
          ],
        },
      },
      fileProcessingState,
      logger,
      requestOptionalFile: async ({ filePath }: { filePath: string }) =>
        filePath === path ? diskContent : null,
      requestClientToolCall: async () => {
        throw new Error('should not apply failed preflight')
      },
    } as any)

    const output = transactionResult.output[0]
    expect(output.type).toBe('json')
    if (output.type === 'json') {
      expect(output.value).toHaveProperty('errorMessage')
    }
    expect(fileProcessingState.failedEditRequiresReadByPath[path]).toBe(true)

    const strReplaceResult = await handleStrReplace({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'replace-after-failed-preflight',
        toolName: 'str_replace',
        input: {
          path,
          replacements: [
            {
              oldString: 'export const value = 1',
              newString: 'export const value = 2',
              allowMultiple: false,
            },
          ],
        },
      },
      fileProcessingState,
      logger,
      requestOptionalFile: async ({ filePath }: { filePath: string }) =>
        filePath === path ? diskContent : null,
      requestClientToolCall: async () => {
        throw new Error('should not apply blocked edit')
      },
      writeToClient: () => {},
    } as any)

    const replaceOutput = strReplaceResult.output[0]
    expect(replaceOutput.type).toBe('json')
    if (replaceOutput.type === 'json') {
      expect(replaceOutput.value).toHaveProperty('errorMessage')
      expect(
        String((replaceOutput.value as { errorMessage?: string }).errorMessage),
      ).toContain('previous str_replace failed for this file')
    }
  })

  it('marks all transaction paths as requiring re-read when client rejects a patch', async () => {
    const path = 'src/helper.ts'
    const otherPath = 'src/other.ts'
    const diskContentByPath: Record<string, string> = {
      [path]: 'export const value = 1\n',
      [otherPath]: 'export const other = 1\n',
    }
    const fileProcessingState = createFileProcessingState()

    const transactionResult = await handleEditTransaction({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'transaction-rejected',
        toolName: 'edit_transaction',
        input: {
          edits: [
            {
              type: 'str_replace',
              path,
              replacements: [
                {
                  oldString: 'export const value = 1',
                  newString: 'export const value = 2',
                  allowMultiple: false,
                },
              ],
            },
            {
              type: 'str_replace',
              path: otherPath,
              replacements: [
                {
                  oldString: 'export const other = 1',
                  newString: 'export const other = 2',
                  allowMultiple: false,
                },
              ],
            },
          ],
        },
      },
      fileProcessingState,
      logger,
      requestOptionalFile: async ({ filePath }: { filePath: string }) =>
        diskContentByPath[filePath] ?? null,
      requestClientToolCall: async (toolCall: any) => [
        {
          type: 'json' as const,
          value: {
            errorMessage: 'client rejected transaction',
            failures: toolCall.input.map((change: { path: string }) => ({
              editIndex: -1,
              path: change.path,
              errorMessage: 'client rejected patch',
            })),
          },
        },
      ],
    } as any)

    const output = transactionResult.output[0]
    expect(output.type).toBe('json')
    if (output.type === 'json') {
      expect(output.value).toHaveProperty('errorMessage')
    }
    expect(fileProcessingState.promisesByPath[path]).toBeUndefined()
    expect(fileProcessingState.promisesByPath[otherPath]).toBeUndefined()
    expect(fileProcessingState.failedEditRequiresReadByPath[path]).toBe(true)
    expect(fileProcessingState.failedEditRequiresReadByPath[otherPath]).toBe(
      true,
    )

    const strReplaceResult = await handleStrReplace({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'replace-after-rejected-transaction',
        toolName: 'str_replace',
        input: {
          path,
          replacements: [
            {
              oldString: 'export const value = 2',
              newString: 'export const value = 3',
              allowMultiple: false,
            },
          ],
        },
      },
      fileProcessingState,
      logger,
      requestOptionalFile: async ({ filePath }: { filePath: string }) =>
        diskContentByPath[filePath] ?? null,
      requestClientToolCall: async () => {
        throw new Error('should not apply blocked edit')
      },
      writeToClient: () => {},
    } as any)

    const replaceOutput = strReplaceResult.output[0]
    expect(replaceOutput.type).toBe('json')
    if (replaceOutput.type === 'json') {
      expect(replaceOutput.value).toHaveProperty('errorMessage')
      expect(
        String((replaceOutput.value as { errorMessage?: string }).errorMessage),
      ).toContain('previous str_replace failed for this file')
    }
  })

  it('passes preflight for TSX content with import type statements', async () => {
    // Regression: edit_transaction preflight must transpile .tsx files with the
    // 'tsx' loader. With the wrong loader, valid `import type { X } from '...'`
    // syntax (and JSX) was rejected as `Expected "from" but found "{"`.
    const path = 'cli/src/components/example.tsx'
    const diskContent = [
      "import React from 'react'",
      '',
      'export function Example() {',
      '  return <div>hello</div>',
      '}',
      '',
    ].join('\n')
    const fileProcessingState = createFileProcessingState()
    let appliedPatch = ''

    const transactionResult = await handleEditTransaction({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'tsx-import-type-transaction',
        toolName: 'edit_transaction',
        input: {
          edits: [
            {
              type: 'str_replace',
              path,
              replacements: [
                {
                  oldString: "import React from 'react'\n",
                  newString:
                    "import React from 'react'\nimport type { KeyEvent } from '@opentui/core'\n",
                  allowMultiple: false,
                },
              ],
            },
          ],
        },
      },
      fileProcessingState,
      logger,
      requestOptionalFile: async ({ filePath }: { filePath: string }) =>
        filePath === path ? diskContent : null,
      requestClientToolCall: async (toolCall: any) => {
        appliedPatch = toolCall.input[0].content
        return confirmedMutationOutput(toolCall)
      },
    } as any)

    const output = transactionResult.output[0]
    expect(output.type).toBe('json')
    if (output.type === 'json') {
      expect(output.value).not.toHaveProperty('errorMessage')
    }
    expect(appliedPatch).toContain(
      "import type { KeyEvent } from '@opentui/core'",
    )
    expect(
      fileProcessingState.failedEditRequiresReadByPath[path],
    ).toBeUndefined()
  })

  it('fails preflight and gives actionable guidance for malformed TSX imports', async () => {
    // The malformed-import class of failure (an `import { ... }` left without a
    // valid `from '...'`) must be rejected atomically AND the error must steer
    // recovery toward structured import operations instead of a re-submit loop.
    const path = 'cli/src/components/broken.tsx'
    const diskContent = [
      "import React from 'react'",
      '',
      'export const value = 1',
      '',
    ].join('\n')
    const fileProcessingState = createFileProcessingState()

    const transactionResult = await handleEditTransaction({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'tsx-malformed-import-transaction',
        toolName: 'edit_transaction',
        input: {
          edits: [
            {
              type: 'str_replace',
              path,
              replacements: [
                {
                  oldString: "import React from 'react'\n",
                  newString:
                    "import React from 'react'\nimport { Broken } { Extra } from 'mod'\n",
                  allowMultiple: false,
                },
              ],
            },
          ],
        },
      },
      fileProcessingState,
      logger,
      requestOptionalFile: async ({ filePath }: { filePath: string }) =>
        filePath === path ? diskContent : null,
      requestClientToolCall: async () => {
        throw new Error('should not apply syntactically-invalid transaction')
      },
    } as any)

    const output = transactionResult.output[0]
    expect(output.type).toBe('json')
    if (output.type === 'json') {
      const value = output.value as { errorMessage?: string }
      expect(value.errorMessage).toContain('Preflight Syntax Validation Failed')
      expect(value.errorMessage).toContain(
        'Do NOT resubmit the same edit_transaction',
      )
      expect(value.errorMessage).toContain('insert_import/remove_import')
    }
    // A preflight syntax failure is semantically distinct from a stale-anchor
    // failure: the edits applied structurally and the disk content is unchanged,
    // so the agent does NOT need to re-read the file before retrying — it only
    // needs to fix the syntax. failedEditRequiresReadByPath must stay unset so
    // the strict read-before-edit gate does not spuriously block the retry.
    expect(
      fileProcessingState.failedEditRequiresReadByPath[path],
    ).toBeUndefined()
  })

  it('marks all transaction paths as requiring re-read when client apply throws', async () => {
    const path = 'src/helper.ts'
    const otherPath = 'src/other.ts'
    const diskContentByPath: Record<string, string> = {
      [path]: 'export const value = 1\n',
      [otherPath]: 'export const other = 1\n',
    }
    const fileProcessingState = createFileProcessingState()

    const transactionResult = await handleEditTransaction({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'transaction-throws',
        toolName: 'edit_transaction',
        input: {
          edits: [
            {
              type: 'str_replace',
              path,
              replacements: [
                {
                  oldString: 'export const value = 1',
                  newString: 'export const value = 2',
                  allowMultiple: false,
                },
              ],
            },
            {
              type: 'str_replace',
              path: otherPath,
              replacements: [
                {
                  oldString: 'export const other = 1',
                  newString: 'export const other = 2',
                  allowMultiple: false,
                },
              ],
            },
          ],
        },
      },
      fileProcessingState,
      logger,
      requestOptionalFile: async ({ filePath }: { filePath: string }) =>
        diskContentByPath[filePath] ?? null,
      requestClientToolCall: async () => {
        throw new Error('client apply threw')
      },
    } as any)

    const output = transactionResult.output[0]
    expect(output.type).toBe('json')
    if (output.type === 'json') {
      expect(output.value).toHaveProperty('errorMessage')
      expect(
        String((output.value as { errorMessage?: string }).errorMessage),
      ).toContain('client apply threw')
    }
    expect(fileProcessingState.promisesByPath[path]).toBeUndefined()
    expect(fileProcessingState.promisesByPath[otherPath]).toBeUndefined()
    expect(fileProcessingState.failedEditRequiresReadByPath[path]).toBe(true)
    expect(fileProcessingState.failedEditRequiresReadByPath[otherPath]).toBe(
      true,
    )
  })

  it('uses current disk content for basedOnRead even when stale per-path edit content remains', async () => {
    const path = 'agents/editor/editor.ts'
    const staleContent = Array.from(
      { length: 2_889 },
      (_, index) => `const stale${index} = ${index};`,
    ).join('\n')
    const diskLines = Array.from({ length: 4_499 }, (_, index) =>
      index === 3_359
        ? 'const target = 1;'
        : `const current${index} = ${index};`,
    )
    const diskContent = diskLines.join('\n')
    const rangeContent = diskLines.slice(3_359, 3_360).join('\n')
    const readCapability = encodeReadCapabilityToken({
      startLine: 3_360,
      endLine: 3_360,
      hash: getContentHash(rangeContent),
    })

    const fileProcessingState = createFileProcessingState()
    fileProcessingState.promisesByPath[path] = [
      Promise.resolve({
        tool: 'str_replace' as const,
        path,
        toolCallId: 'stale-edit',
        content: staleContent,
        patch: '',
        messages: [],
      }),
    ]

    let appliedPatchContent = ''
    let requestOptionalFileLineCount = 0
    const strReplaceResult = await handleStrReplace({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'replace-anchored',
        toolName: 'str_replace',
        input: {
          path,
          replacements: [
            {
              oldString: 'const target = 1;',
              newString: 'const target = 2;',
              allowMultiple: false,
              basedOnRead: readCapability,
            },
          ],
        },
      },
      fileProcessingState,
      logger,
      requestOptionalFile: async ({ filePath }: { filePath: string }) => {
        if (filePath !== path) return null
        requestOptionalFileLineCount = diskContent.split('\n').length
        return diskContent
      },
      requestClientToolCall: async (toolCall: any) => {
        appliedPatchContent = toolCall.input.content
        return confirmedMutationOutput(toolCall)
      },
      writeToClient: () => {},
    } as any)

    const output = strReplaceResult.output[0]
    expect(output.type).toBe('json')
    if (output.type === 'json') {
      expect(output.value).not.toHaveProperty('errorMessage')
      expect(requestOptionalFileLineCount).toBe(4_499)
      expect(appliedPatchContent).toContain('-const target = 1;')
      expect(appliedPatchContent).toContain('+const target = 2;')
    }
    expect(
      fileProcessingState.failedEditRequiresReadByPath[path],
    ).toBeUndefined()
  })

  it('clears stale per-path edit content so readCapability validation uses current disk content', async () => {
    const path = 'src/large.ts'
    const staleContent = Array.from({ length: 1_001 }, (_, index) =>
      index === 500 ? 'const target = 0;' : `const stale${index} = ${index};`,
    ).join('\n')
    const diskLines = Array.from({ length: 1_501 }, (_, index) =>
      index === 1_200
        ? 'const target = 1;'
        : `const current${index} = ${index};`,
    )
    const diskContent = diskLines.join('\n')
    const rangeContent = diskLines.slice(1_200, 1_201).join('\n')
    const readCapability = encodeReadCapabilityToken({
      startLine: 1_201,
      endLine: 1_201,
      hash: getContentHash(rangeContent),
    })

    const fileProcessingState = createFileProcessingState()
    fileProcessingState.failedEditRequiresReadByPath[path] = true
    fileProcessingState.promisesByPath[path] = [
      Promise.resolve({
        tool: 'str_replace' as const,
        path,
        toolCallId: 'stale-edit',
        content: staleContent,
        patch: '',
        messages: [],
      }),
    ]

    let appliedPatchContent = ''
    const requestOptionalFile = async ({ filePath }: { filePath: string }) =>
      filePath === path ? diskContent : null
    const requestFiles = async () => ({
      kind: 'read_files_result' as const,
      version: 1 as const,
      status: 'ok' as const,
      summary: {
        requested: 1,
        ok: 1,
        partial: 0,
        failed: 0,
        uniquePaths: 1,
      },
      results: [
        {
          selector: 'range' as const,
          requestIndex: 0,
          path,
          status: 'ok' as const,
          content: rangeContent,
          startLine: 1_201,
          endLine: 1_201,
          totalLines: 1_501,
          complete: true,
          rangeHash: getContentHash(rangeContent),
          readCapability,
        },
      ],
    })

    await handleReadFiles({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'read-1',
        toolName: 'read_files',
        input: {
          paths: [],
          ranges: [{ path, startLine: 1_201, endLine: 1_201 }],
        },
      },
      fileContext: mockFileContext,
      fileProcessingState,
      requestFiles,
      logger,
    } as any)

    expect(
      fileProcessingState.failedEditRequiresReadByPath[path],
    ).toBeUndefined()
    expect(fileProcessingState.promisesByPath[path]).toBeUndefined()

    const strReplaceResult = await handleStrReplace({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'replace-1',
        toolName: 'str_replace',
        input: {
          path,
          replacements: [
            {
              oldString: 'const target = 1;',
              newString: 'const target = 2;',
              allowMultiple: false,
              basedOnRead: readCapability,
            },
          ],
        },
      },
      fileProcessingState,
      logger,
      requestOptionalFile,
      requestClientToolCall: async (toolCall: any) => {
        appliedPatchContent = toolCall.input.content
        return confirmedMutationOutput(toolCall)
      },
      writeToClient: () => {},
    } as any)

    const output = strReplaceResult.output[0]
    expect(output.type).toBe('json')
    if (output.type === 'json') {
      expect(output.value).not.toHaveProperty('errorMessage')
      expect(output.value).toMatchObject({
        kind: 'file_mutation_result',
        outcome: 'applied',
        actions: [expect.objectContaining({ path })],
      })
      expect(appliedPatchContent).toContain('-const target = 1;')
      expect(appliedPatchContent).toContain('+const target = 2;')
    }
    expect(
      fileProcessingState.failedEditRequiresReadByPath[path],
    ).toBeUndefined()
  })

  it('waits for an in-flight read_files recovery before choosing edit base content', async () => {
    const path = 'src/streamed-large.ts'
    const staleContent = Array.from({ length: 1_001 }, (_, index) =>
      index === 500 ? 'const target = 0;' : `const stale${index} = ${index};`,
    ).join('\n')
    const diskLines = Array.from({ length: 1_501 }, (_, index) =>
      index === 1_200
        ? 'const target = 1;'
        : `const current${index} = ${index};`,
    )
    const diskContent = diskLines.join('\n')
    const rangeContent = diskLines.slice(1_200, 1_201).join('\n')
    const readCapability = encodeReadCapabilityToken({
      startLine: 1_201,
      endLine: 1_201,
      hash: getContentHash(rangeContent),
    })

    const fileProcessingState = createFileProcessingState()
    fileProcessingState.failedEditRequiresReadByPath[path] = true
    fileProcessingState.promisesByPath[path] = [
      Promise.resolve({
        tool: 'str_replace' as const,
        path,
        toolCallId: 'stale-edit',
        content: staleContent,
        patch: '',
        messages: [],
      }),
    ]

    let releaseRead!: () => void
    const readFinished = new Promise<void>((resolve) => {
      releaseRead = resolve
    })
    let appliedPatchContent = ''

    const readPromise = handleReadFiles({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'read-1',
        toolName: 'read_files',
        input: {
          paths: [],
          ranges: [{ path, startLine: 1_201, endLine: 1_201 }],
        },
      },
      fileContext: mockFileContext,
      fileProcessingState,
      requestFiles: async ({ filePaths }: { filePaths: string[] }) => {
        await readFinished
        return Object.fromEntries(
          filePaths.map((filePath) => [
            filePath,
            filePath === path ? diskContent : null,
          ]),
        )
      },
      logger,
    } as any)

    const strReplacePromise = handleStrReplace({
      previousToolCallFinished: readPromise.then(() => undefined),
      toolCall: {
        toolCallId: 'replace-1',
        toolName: 'str_replace',
        input: {
          path,
          replacements: [
            {
              oldString: 'const target = 1;',
              newString: 'const target = 2;',
              allowMultiple: false,
              basedOnRead: readCapability,
            },
          ],
        },
      },
      fileProcessingState,
      logger,
      requestOptionalFile: async ({ filePath }: { filePath: string }) =>
        filePath === path ? diskContent : null,
      requestClientToolCall: async (toolCall: any) => {
        appliedPatchContent = toolCall.input.content
        return [
          {
            type: 'json' as const,
            value: {
              file: toolCall.input.path,
              message: 'applied',
            },
          },
        ]
      },
      writeToClient: () => {},
    } as any)

    expect(fileProcessingState.failedEditRequiresReadByPath[path]).toBe(true)
    expect(fileProcessingState.promisesByPath[path]).toHaveLength(1)

    releaseRead()
    await readPromise
    const strReplaceResult = await strReplacePromise

    const output = strReplaceResult.output[0]
    expect(output.type).toBe('json')
    if (output.type === 'json') {
      expect(output.value).not.toHaveProperty('errorMessage')
      expect(output.value).toMatchObject({ file: path })
      expect(appliedPatchContent).toContain('-const target = 1;')
      expect(appliedPatchContent).toContain('+const target = 2;')
    }
  })

  describe('strict read-before-edit (Milestone 2 staged)', () => {
    it('default strict=false allows str_replace without a prior read', async () => {
      const path = 'src/helper.ts'
      const diskContent = 'export const value = 1\n'
      const fileProcessingState = createFileProcessingState()
      let applied = false

      const result = await handleStrReplace({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'default-non-strict',
          toolName: 'str_replace',
          input: {
            path,
            replacements: [
              {
                oldString: 'export const value = 1',
                newString: 'export const value = 2',
                allowMultiple: false,
              },
            ],
          },
        },
        fileProcessingState,
        logger,
        requestOptionalFile: async ({ filePath }: { filePath: string }) =>
          filePath === path ? diskContent : null,
        requestClientToolCall: async (toolCall: any) => {
          applied = true
          return [
            {
              type: 'json' as const,
              value: { file: toolCall.input.path, message: 'applied' },
            },
          ]
        },
        writeToClient: () => {},
      } as any)

      expect(applied).toBe(true)
      const output = result.output[0]
      expect(output.type).toBe('json')
      if (output.type === 'json') {
        expect(output.value).not.toHaveProperty('errorMessage')
      }
    })

    it('strict str_replace blocks without prior read and does not call client apply', async () => {
      const path = 'src/helper.ts'
      const diskContent = 'export const value = 1\n'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true

      const result = await handleStrReplace({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-blocked',
          toolName: 'str_replace',
          input: {
            path,
            replacements: [
              {
                oldString: 'export const value = 1',
                newString: 'export const value = 2',
                allowMultiple: false,
              },
            ],
          },
        },
        fileProcessingState,
        logger,
        requestOptionalFile: async ({ filePath }: { filePath: string }) =>
          filePath === path ? diskContent : null,
        requestClientToolCall: async () => {
          throw new Error(
            'client apply must not be called when strict mode blocks the edit',
          )
        },
        writeToClient: () => {},
      } as any)

      const output = result.output[0]
      expect(output.type).toBe('json')
      if (output.type === 'json') {
        const value = output.value as { file?: string; errorMessage?: string }
        expect(value.file).toBe(path)
        expect(String(value.errorMessage)).toContain(
          'strict read-before-edit is enabled',
        )
        expect(String(value.errorMessage)).toContain('read_files')
      }
    })

    it('revokes and blocks a cross-turn whole-file authorization when the file changed externally', async () => {
      const path = 'src/stale-auth.ts'
      const readContent = 'export const value = 1\n'
      const diskContent = 'export const value = 2\n'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true
      fileProcessingState.readAuthorizationsByPath = { [path]: true }
      fileProcessingState.readAuthorizationHashesByPath = {
        [path]: getContentHash(readContent),
      }
      let applied = false

      const result = await handleStrReplace({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'stale-whole-file-auth',
          toolName: 'str_replace',
          input: {
            path,
            replacements: [
              {
                oldString: 'export const value = 1',
                newString: 'export const value = 3',
                allowMultiple: false,
              },
            ],
          },
        },
        fileProcessingState,
        logger,
        requestOptionalFile: async () => diskContent,
        requestClientToolCall: async () => {
          applied = true
          return []
        },
        writeToClient: () => {},
      } as any)

      expect(applied).toBe(false)
      expect(result.output[0]?.type).toBe('json')
      if (result.output[0]?.type === 'json') {
        expect(String((result.output[0].value as any).errorMessage)).toContain(
          'changed after its last whole-file read',
        )
      }
      expect(
        fileProcessingState.readAuthorizationsByPath?.[path],
      ).toBeUndefined()
      expect(
        fileProcessingState.readAuthorizationHashesByPath?.[path],
      ).toBeUndefined()
    })

    it('allows a fresh scoped capability to recover after stale whole-file authorization without granting whole-file auth', async () => {
      const path = 'src/scoped-recovery.ts'
      const readContent = 'export const value = 1\n'
      const diskContent = 'export const value = 2\n'
      const currentLine = 'export const value = 2'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true
      fileProcessingState.readAuthorizationsByPath = { [path]: true }
      fileProcessingState.readAuthorizationHashesByPath = {
        [path]: getContentHash(readContent),
      }
      let applied = false

      const result = await handleStrReplace({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'stale-auth-scoped-recovery',
          toolName: 'str_replace',
          input: {
            path,
            replacements: [
              {
                oldString: currentLine,
                newString: 'export const value = 3',
                allowMultiple: false,
                basedOnRead: encodeReadCapabilityToken({
                  startLine: 1,
                  endLine: 1,
                  hash: getContentHash(currentLine),
                }),
              },
            ],
          },
        },
        fileProcessingState,
        logger,
        requestOptionalFile: async () => diskContent,
        requestClientToolCall: async () => {
          applied = true
          return [
            {
              type: 'json' as const,
              value: { file: path, message: 'applied' },
            },
          ]
        },
        writeToClient: () => {},
      } as any)

      expect(applied).toBe(true)
      expect(result.output[0]?.type).toBe('json')
      if (result.output[0]?.type === 'json') {
        expect(result.output[0].value).not.toHaveProperty('errorMessage')
      }
      expect(
        fileProcessingState.readAuthorizationsByPath?.[path],
      ).toBeUndefined()
      expect(
        fileProcessingState.readAuthorizationHashesByPath?.[path],
      ).toBeUndefined()
    })

    it('fails closed for legacy Boolean-only whole-file authorization', async () => {
      const path = 'src/legacy-auth.ts'
      const diskContent = 'export const value = 1\n'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true
      fileProcessingState.readAuthorizationsByPath = { [path]: true }

      const result = await handleStrReplace({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'legacy-boolean-only-auth',
          toolName: 'str_replace',
          input: {
            path,
            replacements: [
              {
                oldString: 'export const value = 1',
                newString: 'export const value = 2',
                allowMultiple: false,
              },
            ],
          },
        },
        fileProcessingState,
        logger,
        requestOptionalFile: async () => diskContent,
        requestClientToolCall: async () => {
          throw new Error('legacy authorization must not reach client apply')
        },
        writeToClient: () => {},
      } as any)

      expect(result.output[0]?.type).toBe('json')
      if (result.output[0]?.type === 'json') {
        expect(result.output[0].value).toHaveProperty('errorMessage')
      }
      expect(
        fileProcessingState.readAuthorizationsByPath?.[path],
      ).toBeUndefined()
    })

    it('strict read_files authorizes consecutive str_replaces via sticky read authorization', async () => {
      const path = 'src/helper.ts'
      const diskContent = 'export const value = 1\n'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true

      await handleReadFiles({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-read',
          toolName: 'read_files',
          input: { paths: [path] },
        },
        fileContext: mockFileContext,
        fileProcessingState,
        requestFiles: async ({ filePaths }: { filePaths: string[] }) =>
          Object.fromEntries(
            filePaths.map((filePath) => [
              filePath,
              filePath === path ? diskContent : null,
            ]),
          ),
        logger,
      } as any)

      expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBe(true)
      expect(fileProcessingState.readAuthorizationHashesByPath?.[path]).toBe(
        getContentHash(diskContent),
      )

      let firstApplyCount = 0
      const firstResult = await handleStrReplace({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-first-edit',
          toolName: 'str_replace',
          input: {
            path,
            replacements: [
              {
                oldString: 'export const value = 1',
                newString: 'export const value = 2',
                allowMultiple: false,
              },
            ],
          },
        },
        fileProcessingState,
        logger,
        requestOptionalFile: async ({ filePath }: { filePath: string }) =>
          filePath === path ? diskContent : null,
        requestClientToolCall: async (toolCall: any) => {
          firstApplyCount += 1
          return confirmedMutationOutput(toolCall)
        },
        writeToClient: () => {},
      } as any)

      expect(firstApplyCount).toBe(1)
      const firstOutput = firstResult.output[0]
      expect(firstOutput.type).toBe('json')
      if (firstOutput.type === 'json') {
        expect(firstOutput.value).not.toHaveProperty('errorMessage')
      }
      // Sticky auth: a successful str_replace does NOT consume the per-path
      // read authorization, so back-to-back edits on the same path do not
      // force redundant read round-trips. Only a failed edit (which sets
      // failedEditRequiresReadByPath) or an externally-changed file
      // (anchored with a fresh basedOnRead capability) re-enables the gate.
      expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBe(true)
      expect(fileProcessingState.readAuthorizationHashesByPath?.[path]).toBe(
        getContentHash('export const value = 2\n'),
      )

      // A second str_replace without re-reading must now SUCCEED using the
      // sticky auth granted by the original read_files call.
      let secondApplyCount = 0
      const secondResult = await handleStrReplace({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-second-edit-sticky',
          toolName: 'str_replace',
          input: {
            path,
            replacements: [
              {
                oldString: 'export const value = 2',
                newString: 'export const value = 3',
                allowMultiple: false,
              },
            ],
          },
        },
        fileProcessingState,
        logger,
        requestOptionalFile: async ({ filePath }: { filePath: string }) =>
          filePath === path ? diskContent : null,
        requestClientToolCall: async (toolCall: any) => {
          secondApplyCount += 1
          return confirmedMutationOutput(toolCall)
        },
        writeToClient: () => {},
      } as any)

      // Second str_replace applied via sticky auth (no re-read required).
      expect(secondApplyCount).toBe(1)
      const secondOutput = secondResult.output[0]
      expect(secondOutput.type).toBe('json')
      if (secondOutput.type === 'json') {
        expect(secondOutput.value).not.toHaveProperty('errorMessage')
      }
      // Auth still persists after the second successful edit.
      expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBe(true)
      expect(fileProcessingState.readAuthorizationHashesByPath?.[path]).toBe(
        getContentHash('export const value = 3\n'),
      )
    })

    it('strict read_files grants sticky read authorization that survives four consecutive str_replaces (read -> edit -> edit -> edit)', async () => {
      const path = 'src/helper.ts'
      const diskContent = 'export const value = 1\n'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true

      // Single read_files call grants the initial per-path authorization.
      await handleReadFiles({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'sticky-read-init',
          toolName: 'read_files',
          input: { paths: [path] },
        },
        fileContext: mockFileContext,
        fileProcessingState,
        requestFiles: async ({ filePaths }: { filePaths: string[] }) =>
          Object.fromEntries(
            filePaths.map((filePath) => [
              filePath,
              filePath === path ? diskContent : null,
            ]),
          ),
        logger,
      } as any)

      expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBe(true)

      // Four back-to-back edits with no intervening read_files calls. Each
      // edit increments its own apply counter via requestClientToolCall. If
      // any of them were blocked, the client would never be invoked and the
      // counter would stay at zero for that edit.
      const edits: Array<{ from: number; to: number }> = [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
        { from: 3, to: 4 },
        { from: 4, to: 5 },
      ]
      let totalApplies = 0

      for (const [i, step] of edits.entries()) {
        const result = await handleStrReplace({
          previousToolCallFinished: Promise.resolve(),
          toolCall: {
            toolCallId: `sticky-edit-${i}`,
            toolName: 'str_replace',
            input: {
              path,
              replacements: [
                {
                  oldString: `export const value = ${step.from}`,
                  newString: `export const value = ${step.to}`,
                  allowMultiple: false,
                },
              ],
            },
          },
          fileProcessingState,
          logger,
          requestOptionalFile: async ({ filePath }: { filePath: string }) =>
            filePath === path ? diskContent : null,
          requestClientToolCall: async (toolCall: any) => {
            totalApplies += 1
            return confirmedMutationOutput(toolCall)
          },
          writeToClient: () => {},
        } as any)

        // Every edit must apply successfully via the sticky auth and must
        // NOT carry an errorMessage.
        const output = result.output[0]
        expect(output.type).toBe('json')
        if (output.type === 'json') {
          expect(output.value).not.toHaveProperty('errorMessage')
        }
      }

      // All four edits applied via the original read_files authorization.
      expect(totalApplies).toBe(4)
      // Auth is still active after the entire read -> edit x4 chain.
      expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBe(true)
      // No failure flag was raised on any of the four edits.
      expect(
        fileProcessingState.failedEditRequiresReadByPath?.[path],
      ).toBeUndefined()
    })

    it('strict read_files authorizes str_replace with equivalent normalized path spellings', async () => {
      const path = 'src/helper.ts'
      const diskContent = 'export const value = 1\n'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true

      await handleReadFiles({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-read-dot-slash',
          toolName: 'read_files',
          input: { paths: [`./${path}`] },
        },
        fileContext: mockFileContext,
        fileProcessingState,
        requestFiles: async ({ filePaths }: { filePaths: string[] }) =>
          Object.fromEntries(
            filePaths.map((filePath) => [
              filePath,
              filePath === path ? diskContent : null,
            ]),
          ),
        logger,
      } as any)

      expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBe(true)
      expect(
        fileProcessingState.readAuthorizationsByPath?.[`./${path}`],
      ).toBeUndefined()

      let applied = false
      const result = await handleStrReplace({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-edit-normalized-path',
          toolName: 'str_replace',
          input: {
            path: `./${path}`,
            replacements: [
              {
                oldString: 'export const value = 1',
                newString: 'export const value = 2',
                allowMultiple: false,
              },
            ],
          },
        },
        fileProcessingState,
        logger,
        requestOptionalFile: async ({ filePath }: { filePath: string }) =>
          filePath === path ? diskContent : null,
        requestClientToolCall: async (toolCall: any) => {
          applied = true
          return confirmedMutationOutput(toolCall)
        },
        writeToClient: () => {},
      } as any)

      expect(applied).toBe(true)
      const output = result.output[0]
      expect(output.type).toBe('json')
      if (output.type === 'json') {
        expect(output.value).toMatchObject({
          kind: 'file_mutation_result',
          outcome: 'applied',
          actions: [expect.objectContaining({ path })],
        })
        expect(output.value).not.toHaveProperty('errorMessage')
      }
      // Sticky auth: the str_replace success keeps the per-path authorization
      // alive so subsequent edits on `path` (and equivalent spellings such
      // as `./path`) do not require a re-read.
      expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBe(true)
    })

    it('strict edit_transaction accepts multi-file reads and edits with equivalent normalized path spellings', async () => {
      const path = 'src/helper.ts'
      const otherPath = 'src/other.ts'
      const diskContentByPath: Record<string, string> = {
        [path]: 'export const value = 1\n',
        [otherPath]: 'export const other = 1\n',
      }
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true

      await handleReadFiles({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-transaction-read-normalized',
          toolName: 'read_files',
          input: { paths: [`./${path}`, otherPath] },
        },
        fileContext: mockFileContext,
        fileProcessingState,
        requestFiles: async ({ filePaths }: { filePaths: string[] }) =>
          Object.fromEntries(
            filePaths.map((filePath) => [
              filePath,
              diskContentByPath[filePath] ?? null,
            ]),
          ),
        logger,
      } as any)

      expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBe(true)
      expect(fileProcessingState.readAuthorizationsByPath?.[otherPath]).toBe(
        true,
      )

      let applied = false
      const result = await handleEditTransaction({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-transaction-normalized',
          toolName: 'edit_transaction',
          input: {
            edits: [
              {
                type: 'str_replace',
                path,
                replacements: [
                  {
                    oldString: 'export const value = 1',
                    newString: 'export const value = 2',
                    allowMultiple: false,
                  },
                ],
              },
              {
                type: 'str_replace',
                path: `./${otherPath}`,
                replacements: [
                  {
                    oldString: 'export const other = 1',
                    newString: 'export const other = 2',
                    allowMultiple: false,
                  },
                ],
              },
            ],
          },
        },
        fileProcessingState,
        logger,
        requestOptionalFile: async ({ filePath }: { filePath: string }) =>
          diskContentByPath[filePath] ?? null,
        requestClientToolCall: async (toolCall: any) => {
          applied = true
          return confirmedMutationOutput(toolCall)
        },
      } as any)

      expect(applied).toBe(true)
      const output = result.output[0]
      expect(output.type).toBe('json')
      if (output.type === 'json') {
        expect(output.value).not.toHaveProperty('errorMessage')
      }
      // Sticky auth: edit_transaction success does NOT consume the per-path
      // authorization, so subsequent single-file edits on those paths
      // remain authorized without a re-read.
      expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBe(true)
      expect(fileProcessingState.readAuthorizationsByPath?.[otherPath]).toBe(
        true,
      )
      expect(fileProcessingState.readAuthorizationHashesByPath?.[path]).toBe(
        getContentHash('export const value = 2\n'),
      )
      expect(
        fileProcessingState.readAuthorizationHashesByPath?.[otherPath],
      ).toBe(getContentHash('export const other = 2\n'))
    })

    it('strict edit_transaction blocks unread paths and lists failures', async () => {
      const path = 'src/helper.ts'
      const otherPath = 'src/other.ts'
      const diskContentByPath: Record<string, string> = {
        [path]: 'export const value = 1\n',
        [otherPath]: 'export const other = 1\n',
      }
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true

      const result = await handleEditTransaction({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-transaction-blocked',
          toolName: 'edit_transaction',
          input: {
            edits: [
              {
                type: 'str_replace',
                path,
                replacements: [
                  {
                    oldString: 'export const value = 1',
                    newString: 'export const value = 2',
                    allowMultiple: false,
                  },
                ],
              },
              {
                type: 'str_replace',
                path: otherPath,
                replacements: [
                  {
                    oldString: 'export const other = 1',
                    newString: 'export const other = 2',
                    allowMultiple: false,
                  },
                ],
              },
            ],
          },
        },
        fileProcessingState,
        logger,
        requestOptionalFile: async ({ filePath }: { filePath: string }) =>
          diskContentByPath[filePath] ?? null,
        requestClientToolCall: async () => {
          throw new Error(
            'client apply must not be called for blocked transaction',
          )
        },
      } as any)

      const output = result.output[0]
      expect(output.type).toBe('json')
      if (output.type === 'json') {
        const value = output.value as {
          errorMessage?: string
          failures?: Array<{ path: string; errorMessage: string }>
        }
        expect(String(value.errorMessage)).toContain(
          'strict read-before-edit is enabled',
        )
        expect(value.failures).toBeDefined()
        const failurePaths = (value.failures ?? []).map((f) => f.path).sort()
        expect(failurePaths).toEqual([otherPath, path].sort())
      }
    })

    it('strict edit_transaction allows a path when its str_replace replacement has basedOnRead even without registry authorization', async () => {
      const path = 'src/helper.ts'
      const diskContent = 'export const value = 1\n'
      const rangeContent = 'export const value = 1'
      const readCapability = encodeReadCapabilityToken({
        startLine: 1,
        endLine: 1,
        hash: getContentHash(rangeContent),
      })
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true

      let applied = false
      const result = await handleEditTransaction({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-transaction-anchored',
          toolName: 'edit_transaction',
          input: {
            edits: [
              {
                type: 'str_replace',
                path,
                replacements: [
                  {
                    oldString: 'export const value = 1',
                    newString: 'export const value = 2',
                    allowMultiple: false,
                    basedOnRead: readCapability,
                  },
                ],
              },
            ],
          },
        },
        fileProcessingState,
        logger,
        requestOptionalFile: async ({ filePath }: { filePath: string }) =>
          filePath === path ? diskContent : null,
        requestClientToolCall: async (toolCall: any) => {
          applied = true
          return confirmedMutationOutput(toolCall)
        },
      } as any)

      expect(applied).toBe(true)
      const output = result.output[0]
      expect(output.type).toBe('json')
      if (output.type === 'json') {
        expect(output.value).not.toHaveProperty('errorMessage')
      }
    })

    it('strict str_replace rejects a stale range capability even when oldString is unique', async () => {
      const path = 'src/stale-anchor.ts'
      const diskContent = 'export const value = 1\n'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true
      let applied = false

      const result = await handleStrReplace({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-stale-anchor',
          toolName: 'str_replace',
          input: {
            path,
            replacements: [
              {
                oldString: 'export const value = 1',
                newString: 'export const value = 2',
                allowMultiple: false,
                basedOnRead: encodeReadCapabilityToken({
                  startLine: 1,
                  endLine: 1,
                  hash: getContentHash('export const value = 0'),
                }),
              },
            ],
          },
        },
        fileProcessingState,
        logger,
        requestOptionalFile: async () => diskContent,
        requestClientToolCall: async () => {
          applied = true
          return []
        },
        writeToClient: () => {},
      } as any)

      expect(applied).toBe(false)
      expect(result.output[0]?.type).toBe('json')
      if (result.output[0]?.type === 'json') {
        const value = result.output[0].value as { errorMessage?: string }
        expect(String(value.errorMessage)).toContain(
          'basedOnRead did not match the current file content',
        )
      }
    })

    it('failed-edit recovery requires a fresh capability on every replacement even when stale path authorization remains', async () => {
      const path = 'src/helper.ts'
      const diskContent = 'export const value = 1\nexport const other = 1\n'
      const firstLine = 'export const value = 1'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true
      fileProcessingState.failedEditRequiresReadByPath[path] = true
      fileProcessingState.readAuthorizationsByPath = { [path]: true }

      let clientApplyCount = 0
      const result = await handleStrReplace({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-failed-edit-partial-capabilities',
          toolName: 'str_replace',
          input: {
            path,
            atomic: true,
            replacements: [
              {
                oldString: firstLine,
                newString: 'export const value = 2',
                allowMultiple: false,
                basedOnRead: encodeReadCapabilityToken({
                  startLine: 1,
                  endLine: 1,
                  hash: getContentHash(firstLine),
                }),
              },
              {
                oldString: 'export const other = 1',
                newString: 'export const other = 2',
                allowMultiple: false,
              },
            ],
          },
        },
        fileProcessingState,
        logger,
        requestOptionalFile: async () => diskContent,
        requestClientToolCall: async () => {
          clientApplyCount += 1
          return []
        },
        writeToClient: () => {},
      } as any)

      expect(clientApplyCount).toBe(0)
      const output = result.output[0]
      expect(output?.type).toBe('json')
      if (output?.type === 'json') {
        expect(String((output.value as any).errorMessage)).toContain(
          'replacement 2/2',
        )
      }
      expect(fileProcessingState.failedEditRequiresReadByPath[path]).toBe(true)
    })

    it('strict edit_transaction rejects a stale basedOnRead capability', async () => {
      const path = 'src/stale-transaction.ts'
      const diskContent = 'export const value = 1\n'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true
      let applied = false

      const result = await handleEditTransaction({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-stale-transaction',
          toolName: 'edit_transaction',
          input: {
            edits: [
              {
                type: 'str_replace',
                path,
                replacements: [
                  {
                    oldString: 'export const value = 1',
                    newString: 'export const value = 2',
                    allowMultiple: false,
                    basedOnRead: encodeReadCapabilityToken({
                      startLine: 1,
                      endLine: 1,
                      hash: getContentHash('export const value = 0'),
                    }),
                  },
                ],
              },
            ],
          },
        },
        fileProcessingState,
        logger,
        requestOptionalFile: async () => diskContent,
        requestClientToolCall: async () => {
          applied = true
          return []
        },
      } as any)

      expect(applied).toBe(false)
      expect(result.output[0]?.type).toBe('json')
      if (result.output[0]?.type === 'json') {
        const value = result.output[0].value as { errorMessage?: string }
        expect(String(value.errorMessage)).toContain(
          'basedOnRead did not match the current file content',
        )
      }
    })

    it('write_file blocks traversal paths before reading or applying', async () => {
      const fileProcessingState = createFileProcessingState()

      const result = await handleWriteFile({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'write-traversal-blocked',
          toolName: 'write_file',
          input: {
            path: '../outside.ts',
            instructions: 'Attempt outside write',
            content: 'export const value = 1\n',
          },
        },
        agentState: { messageHistory: [] },
        clientSessionId: 'test-session',
        fileProcessingState,
        fingerprintId: 'test-fingerprint',
        logger,
        prompt: undefined,
        userId: undefined,
        userInputId: 'test-input',
        requestOptionalFile: async () => {
          throw new Error(
            'requestOptionalFile must not be called for blocked traversal',
          )
        },
        requestClientToolCall: async () => {
          throw new Error(
            'client apply must not be called for blocked traversal',
          )
        },
        writeToClient: () => {},
      } as any)

      const output = result.output[0]
      expect(output.type).toBe('json')
      if (output.type === 'json') {
        const value = output.value as { file?: string; errorMessage?: string }
        expect(value.file).toBe('../outside.ts')
        expect(String(value.errorMessage)).toContain('path traversal blocked')
      }
      expect(fileProcessingState.promisesByPath['']).toBeUndefined()
      expect(fileProcessingState.allPromises).toHaveLength(0)
    })

    it('strict write_file blocks existing-file overwrites without prior read and does not call client apply', async () => {
      const path = 'src/helper.ts'
      const diskContent = 'export const value = 1\n'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true

      const result = await handleWriteFile({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-write-blocked',
          toolName: 'write_file',
          input: {
            path,
            instructions: 'Update helper value',
            content: 'export const value = 2\n',
          },
        },
        agentState: { messageHistory: [] },
        clientSessionId: 'test-session',
        fileProcessingState,
        fingerprintId: 'test-fingerprint',
        logger,
        prompt: undefined,
        userId: undefined,
        userInputId: 'test-input',
        requestOptionalFile: async ({ filePath }: { filePath: string }) =>
          filePath === path ? diskContent : null,
        requestClientToolCall: async () => {
          throw new Error(
            'client apply must not be called for blocked write_file',
          )
        },
        writeToClient: () => {},
      } as any)

      const output = result.output[0]
      expect(output.type).toBe('json')
      if (output.type === 'json') {
        const value = output.value as { file?: string; errorMessage?: string }
        expect(value.file).toBe(path)
        expect(String(value.errorMessage)).toContain('write_file blocked')
        expect(String(value.errorMessage)).toContain('read_files')
      }
    })

    it('strict write_file blocks a whole-file overwrite after only a prior range-anchored edit', async () => {
      const path = 'src/range-edited.ts'
      const diskContent = 'export const value = 1\n'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true
      fileProcessingState.promisesByPath[path] = [
        Promise.resolve({
          tool: 'str_replace' as const,
          path,
          toolCallId: 'range-edit',
          content: 'export const value = 2\n',
          messages: [],
        }),
      ]

      let clientApplyCount = 0
      const result = await handleWriteFile({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'whole-write-after-range-edit',
          toolName: 'write_file',
          input: { path, content: 'export const value = 3\n' },
        },
        agentState: { messageHistory: [] },
        clientSessionId: 'test-session',
        fileProcessingState,
        fingerprintId: 'test-fingerprint',
        logger,
        prompt: undefined,
        userId: undefined,
        userInputId: 'test-input',
        requestOptionalFile: async () => diskContent,
        requestClientToolCall: async () => {
          clientApplyCount += 1
          return []
        },
        writeToClient: () => {},
      } as any)

      expect(clientApplyCount).toBe(0)
      const output = result.output[0]
      expect(output?.type).toBe('json')
      if (output?.type === 'json') {
        expect(String((output.value as any).errorMessage)).toContain(
          'prior range-anchored edit',
        )
      }
    })

    it('write_file failed-edit gate blocks an existing file even when stale whole-file authorization remains', async () => {
      const path = 'src/failed-write.ts'
      const diskContent = 'export const value = 1\n'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true
      fileProcessingState.failedEditRequiresReadByPath[path] = true
      fileProcessingState.readAuthorizationsByPath = { [path]: true }

      let clientApplyCount = 0
      const result = await handleWriteFile({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'blocked-after-failed-write',
          toolName: 'write_file',
          input: { path, content: 'export const value = 2\n' },
        },
        agentState: { messageHistory: [] },
        clientSessionId: 'test-session',
        fileProcessingState,
        fingerprintId: 'test-fingerprint',
        logger,
        prompt: undefined,
        userId: undefined,
        userInputId: 'test-input',
        requestOptionalFile: async () => diskContent,
        requestClientToolCall: async () => {
          clientApplyCount += 1
          return []
        },
        writeToClient: () => {},
      } as any)

      expect(clientApplyCount).toBe(0)
      const output = result.output[0]
      expect(output?.type).toBe('json')
      if (output?.type === 'json') {
        expect(String((output.value as any).errorMessage)).toContain(
          'previous edit failed',
        )
      }
    })

    it('strict write_file allows new-file creation without prior read', async () => {
      const path = 'src/new-helper.ts'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true

      let applied = false
      const result = await handleWriteFile({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-write-new-file',
          toolName: 'write_file',
          input: {
            path,
            instructions: 'Create helper value',
            content: 'export const value = 1\n',
          },
        },
        agentState: { messageHistory: [] },
        clientSessionId: 'test-session',
        fileProcessingState,
        fingerprintId: 'test-fingerprint',
        logger,
        prompt: undefined,
        userId: undefined,
        userInputId: 'test-input',
        requestOptionalFile: async () => null,
        requestClientToolCall: async (toolCall: any) => {
          applied = true
          return [
            {
              type: 'json' as const,
              value: { file: toolCall.input.path, message: 'created' },
            },
          ]
        },
        writeToClient: () => {},
      } as any)

      expect(applied).toBe(true)
      const output = result.output[0]
      expect(output.type).toBe('json')
      if (output.type === 'json') {
        expect(output.value).not.toHaveProperty('errorMessage')
      }
    })

    it('strict write_file new-file creation grants read auth so a follow-up str_replace can edit without re-reading', async () => {
      const path = 'src/newly-written-helper.ts'
      const writtenContent = 'export const value = 1\n'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true

      let writeApplied = false
      const writeResult = await handleWriteFile({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-write-new-file-grants-auth',
          toolName: 'write_file',
          input: {
            path,
            instructions: 'Create helper value',
            content: writtenContent,
          },
        },
        agentState: { messageHistory: [] },
        clientSessionId: 'test-session',
        fileProcessingState,
        fingerprintId: 'test-fingerprint',
        logger,
        prompt: undefined,
        userId: undefined,
        userInputId: 'test-input',
        requestOptionalFile: async () => null,
        requestClientToolCall: async (toolCall: any) => {
          writeApplied = true
          return confirmedMutationOutput(toolCall)
        },
        writeToClient: () => {},
      } as any)

      expect(writeApplied).toBe(true)
      const writeOutput = writeResult.output[0]
      expect(writeOutput.type).toBe('json')
      if (writeOutput.type === 'json') {
        expect(writeOutput.value).not.toHaveProperty('errorMessage')
      }

      // The fix: a successful write_file (even on a brand-new file with no prior
      // read) must grant a one-shot read authorization so the very common
      // write-then-edit flow does not need a redundant read round-trip.
      expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBe(true)

      // A follow-up str_replace must succeed using the just-granted auth
      // without the agent having to call read_files separately.
      let strReplaceApplied = false
      const strReplaceResult = await handleStrReplace({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-edit-after-new-write',
          toolName: 'str_replace',
          input: {
            path,
            replacements: [
              {
                oldString: 'export const value = 1',
                newString: 'export const value = 2',
                allowMultiple: false,
              },
            ],
          },
        },
        fileProcessingState,
        logger,
        requestOptionalFile: async ({ filePath }: { filePath: string }) =>
          filePath === path ? writtenContent : null,
        requestClientToolCall: async (toolCall: any) => {
          strReplaceApplied = true
          return confirmedMutationOutput(toolCall)
        },
        writeToClient: () => {},
      } as any)

      expect(strReplaceApplied).toBe(true)
      const strReplaceOutput = strReplaceResult.output[0]
      expect(strReplaceOutput.type).toBe('json')
      if (strReplaceOutput.type === 'json') {
        expect(strReplaceOutput.value).not.toHaveProperty('errorMessage')
      }

      // Sticky auth: the write_file grant (and the follow-up str_replace)
      // remain in force across subsequent edits on the same path. A third
      // str_replace without re-reading must SUCCEED and keep auth alive,
      // because the strict gate only re-enables after a failed edit or an
      // externally-changed file (anchored with a fresh basedOnRead capability).
      let thirdApplyCount = 0
      const thirdResult = await handleStrReplace({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-edit-sticky-after-write',
          toolName: 'str_replace',
          input: {
            path,
            replacements: [
              {
                oldString: 'export const value = 2',
                newString: 'export const value = 3',
                allowMultiple: false,
              },
            ],
          },
        },
        fileProcessingState,
        logger,
        requestOptionalFile: async ({ filePath }: { filePath: string }) =>
          filePath === path ? writtenContent : null,
        requestClientToolCall: async (toolCall: any) => {
          thirdApplyCount += 1
          return confirmedMutationOutput(toolCall)
        },
        writeToClient: () => {},
      } as any)

      // Third str_replace applied via sticky auth (no re-read required).
      expect(thirdApplyCount).toBe(1)
      const thirdOutput = thirdResult.output[0]
      expect(thirdOutput.type).toBe('json')
      if (thirdOutput.type === 'json') {
        expect(thirdOutput.value).not.toHaveProperty('errorMessage')
      }
      // Auth remains true across the entire write -> edit -> edit -> edit
      // chain with no intervening read_files calls.
      expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBe(true)
    })

    it('strict read_files authorizes one write_file overwrite and the authorization is preserved after success', async () => {
      const path = 'src/helper.ts'
      const diskContent = 'export const value = 1\n'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true

      await handleReadFiles({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-write-read',
          toolName: 'read_files',
          input: { paths: [path] },
        },
        fileContext: mockFileContext,
        fileProcessingState,
        requestFiles: async ({ filePaths }: { filePaths: string[] }) =>
          Object.fromEntries(
            filePaths.map((filePath) => [
              filePath,
              filePath === path ? diskContent : null,
            ]),
          ),
        logger,
      } as any)

      expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBe(true)

      let applied = false
      const result = await handleWriteFile({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-write-authorized',
          toolName: 'write_file',
          input: {
            path,
            instructions: 'Update helper value',
            content: 'export const value = 2\n',
          },
        },
        agentState: { messageHistory: [] },
        clientSessionId: 'test-session',
        fileProcessingState,
        fingerprintId: 'test-fingerprint',
        logger,
        prompt: undefined,
        userId: undefined,
        userInputId: 'test-input',
        requestOptionalFile: async ({ filePath }: { filePath: string }) =>
          filePath === path ? diskContent : null,
        requestClientToolCall: async (toolCall: any) => {
          applied = true
          return confirmedMutationOutput(toolCall)
        },
        writeToClient: () => {},
      } as any)

      expect(applied).toBe(true)
      const output = result.output[0]
      expect(output.type).toBe('json')
      if (output.type === 'json') {
        expect(output.value).not.toHaveProperty('errorMessage')
      }
      expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBe(true)
      expect(fileProcessingState.readAuthorizationHashesByPath?.[path]).toBe(
        getContentHash('export const value = 2\n'),
      )
    })

    it('strict replace_range blocks without prior read or freshness anchor and does not call client apply', async () => {
      const path = 'src/helper.ts'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true

      const result = await handleReplaceRange({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'replace-range-blocked',
          toolName: 'replace_range',
          input: {
            path,
            startLine: 1,
            endLine: 1,
            newContent: 'export const value = 2',
          },
        },
        fileProcessingState,
        requestClientToolCall: async () => {
          throw new Error(
            'client apply must not be called for blocked replace_range',
          )
        },
      } as any)

      const output = result.output[0]
      expect(output.type).toBe('json')
      if (output.type === 'json') {
        const value = output.value as { file?: string; errorMessage?: string }
        expect(value.file).toBe(path)
        expect(String(value.errorMessage)).toContain('replace_range blocked')
        expect(String(value.errorMessage)).toContain('read_files')
      }
      expect(fileProcessingState.failedEditRequiresReadByPath[path]).toBe(true)
    })

    it('replace_range preserves strict read authorization on success and only flags re-read after client errors', async () => {
      const path = 'src/helper.ts'
      let diskContent = 'export const value = 1\n'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true
      fileProcessingState.readAuthorizationsByPath = { [path]: true }
      fileProcessingState.readAuthorizationHashesByPath = {
        [path]: getContentHash(diskContent),
      }

      const successResult = await handleReplaceRange({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'replace-range-success',
          toolName: 'replace_range',
          input: {
            path,
            startLine: 1,
            endLine: 1,
            expectedHash: 'sha256:current',
            newContent: 'export const value = 2',
          },
        },
        fileProcessingState,
        requestOptionalFile: async () => diskContent,
        requestClientToolCall: async (toolCall: any) => {
          diskContent = 'export const value = 2\n'
          return confirmedMutationOutput(toolCall)
        },
      } as any)

      expect(successResult.output[0]?.type).toBe('json')
      // Sticky auth: a successful replace_range does NOT consume the auth.
      expect(fileProcessingState.readAuthorizationsByPath?.[path]).toBe(true)
      expect(
        fileProcessingState.failedEditRequiresReadByPath[path],
      ).toBeUndefined()

      const errorResult = await handleReplaceRange({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'replace-range-error',
          toolName: 'replace_range',
          input: {
            path,
            startLine: 1,
            endLine: 1,
            expectedHash: 'sha256:stale',
            newContent: 'export const value = 3',
          },
        },
        fileProcessingState,
        requestOptionalFile: async () => diskContent,
        requestClientToolCall: async (toolCall: any) => [
          {
            type: 'json' as const,
            value: {
              file: toolCall.input.path,
              errorMessage: 'replace_range rejected: stale range',
            },
          },
        ],
      } as any)

      expect(errorResult.output[0]?.type).toBe('json')
      expect(fileProcessingState.failedEditRequiresReadByPath[path]).toBe(true)
    })

    it('Reduction A: strict replace_range allows when expectedHash is supplied as freshness anchor', async () => {
      const path = 'src/helper.ts'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true
      // No read authorization registered — only expectedHash as anchor.

      let applied = false
      const result = await handleReplaceRange({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'replace-range-anchor',
          toolName: 'replace_range',
          input: {
            path,
            startLine: 1,
            endLine: 1,
            expectedHash: 'sha256:fresh',
            newContent: 'export const value = 2',
          },
        },
        fileProcessingState,
        requestClientToolCall: async (toolCall: any) => {
          applied = true
          return confirmedMutationOutput(toolCall)
        },
      } as any)

      expect(applied).toBe(true)
      const output = result.output[0]
      expect(output.type).toBe('json')
      if (output.type === 'json') {
        expect(output.value).not.toHaveProperty('errorMessage')
      }
      expect(
        fileProcessingState.failedEditRequiresReadByPath[path],
      ).toBeUndefined()
    })

    it('Reduction D: strict str_replace error message omits "in this turn" and "Recovery required:"', async () => {
      const path = 'src/helper.ts'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true

      const result = await handleStrReplace({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'strict-msg-check',
          toolName: 'str_replace',
          input: {
            path,
            replacements: [
              {
                old_string: 'export const value = 1',
                new_string: 'export const value = 2',
              },
            ],
          },
        },
        fileProcessingState,
        requestClientToolCall: async () => {
          throw new Error(
            'client apply must not be called for blocked str_replace',
          )
        },
      } as any)

      const output = result.output[0]
      expect(output.type).toBe('json')
      if (output.type === 'json') {
        const value = output.value as { errorMessage?: string }
        expect(String(value.errorMessage)).not.toContain('in this turn')
        expect(String(value.errorMessage)).not.toContain('Recovery required:')
        // Should still mention the actionable next step.
        expect(String(value.errorMessage)).toContain('read_files')
      }
    })

    it('does not let a range basedOnRead capability authorize a whole-file overwrite', async () => {
      const path = 'src/helper.ts'
      const diskContent = 'export const value = 1\n'
      const fileProcessingState = createFileProcessingState()
      fileProcessingState.strictReadBeforeEdit = true

      // A range capability is not sufficient proof for replacing the whole
      // file. Strict mode requires a successful whole-file read authorization.
      const writeResult = await handleWriteFile({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'e-bypass-write',
          toolName: 'write_file',
          input: {
            path,
            instructions: 'Update helper value',
            content: 'export const value = 2\n',
            basedOnRead: {
              startLine: 1,
              endLine: 1,
              hash: 'sha256:prior-fresh',
            },
          },
        },
        agentState: { messageHistory: [] },
        clientSessionId: 'test-session',
        fileProcessingState,
        fingerprintId: 'test-fingerprint',
        logger,
        prompt: undefined,
        userId: undefined,
        userInputId: 'test-input',
        requestOptionalFile: async ({ filePath }: { filePath: string }) =>
          filePath === path ? diskContent : null,
        requestClientToolCall: async (toolCall: any) => [
          {
            type: 'json' as const,
            value: { file: toolCall.input.path, message: 'applied' },
          },
        ],
        writeToClient: () => {},
      } as any)

      const writeOutput = writeResult.output[0]
      expect(writeOutput.type).toBe('json')
      if (writeOutput.type === 'json') {
        const value = writeOutput.value as { errorMessage?: string }
        expect(String(value.errorMessage)).toContain(
          'range capability cannot authorize a whole-file overwrite',
        )
      }
    })

    it('strict read_files auth survives across separate fileProcessingState instances (cross-turn state isolation)', async () => {
      // Regression: read_files populates fileProcessingState.readAuthorizationsByPath,
      // but the runtime recreates a fresh fileProcessingState on every
      // processStream/runProgrammaticStep invocation. A model that reads in
      // turn N and edits in turn N+1 must still have the per-path authorization
      // available, otherwise the strict gate blocks the edit on the first
      // attempt and forces a redundant read round-trip.
      //
      // The fix: readAuthorizationsByPath must be persisted on agentState
      // (which survives across turns) and hydrated into the per-turn
      // fileProcessingState at the start of each invocation. The test below
      // mirrors that hydration: after read_files populates state A, the
      // authorization set is copied into state B (the next turn's state).
      const path = 'src/helper.ts'
      const diskContent = 'export const value = 1\n'
      const strictReadBeforeEdit = true

      // --- Turn 1: read_files populates auth on state A ---
      const stateA = createFileProcessingState()
      stateA.strictReadBeforeEdit = strictReadBeforeEdit

      await handleReadFiles({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'cross-turn-read',
          toolName: 'read_files',
          input: { paths: [path] },
        },
        fileContext: mockFileContext,
        fileProcessingState: stateA,
        requestFiles: async ({ filePaths }: { filePaths: string[] }) =>
          Object.fromEntries(
            filePaths.map((filePath) => [
              filePath,
              filePath === path ? diskContent : null,
            ]),
          ),
        logger,
      } as any)

      expect(stateA.readAuthorizationsByPath?.[path]).toBe(true)

      // --- Turn boundary: persist auth from state A to agentState, then
      // hydrate a fresh state B (simulating what processStream must do). ---
      const persistedAuth = { ...(stateA.readAuthorizationsByPath ?? {}) }
      const persistedHashes = {
        ...(stateA.readAuthorizationHashesByPath ?? {}),
      }
      expect(persistedAuth[path]).toBe(true)
      expect(persistedHashes[path]).toBe(getContentHash(diskContent))

      const stateB = createFileProcessingState()
      stateB.strictReadBeforeEdit = strictReadBeforeEdit
      stateB.readAuthorizationsByPath = { ...persistedAuth }
      stateB.readAuthorizationHashesByPath = { ...persistedHashes }

      // --- Turn 2: str_replace on the fresh state B must succeed without
      // requiring the agent to re-read the file. ---
      let applyCount = 0
      const result = await handleStrReplace({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'cross-turn-edit',
          toolName: 'str_replace',
          input: {
            path,
            replacements: [
              {
                oldString: 'export const value = 1',
                newString: 'export const value = 2',
                allowMultiple: false,
              },
            ],
          },
        },
        fileProcessingState: stateB,
        logger,
        requestOptionalFile: async ({ filePath }: { filePath: string }) =>
          filePath === path ? diskContent : null,
        requestClientToolCall: async (toolCall: any) => {
          applyCount += 1
          return confirmedMutationOutput(toolCall)
        },
        writeToClient: () => {},
      } as any)

      expect(applyCount).toBe(1)
      const output = result.output[0]
      expect(output.type).toBe('json')
      if (output.type === 'json') {
        expect(output.value).not.toHaveProperty('errorMessage')
      }
      // The fix must keep the auth alive after the cross-turn edit so a
      // third turn's edit (or a follow-up edit_transaction) also succeeds
      // without re-reading.
      expect(stateB.readAuthorizationsByPath?.[path]).toBe(true)
    })

    it('strict str_replace on a fresh fileProcessingState without hydrated auth blocks (proves the cross-turn bug exists without the fix)', async () => {
      // Companion to the test above: this one models the BUG. It builds a
      // fresh state B without hydrating auth from state A, then confirms the
      // strict gate blocks the edit. This is the exact user-reported failure
      // mode: read in turn N, edit in turn N+1, first edit is blocked.
      const path = 'src/helper.ts'
      const diskContent = 'export const value = 1\n'

      // Turn 1: read_files populates auth on state A.
      const stateA = createFileProcessingState()
      stateA.strictReadBeforeEdit = true
      await handleReadFiles({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'bug-demo-read',
          toolName: 'read_files',
          input: { paths: [path] },
        },
        fileContext: mockFileContext,
        fileProcessingState: stateA,
        requestFiles: async ({ filePaths }: { filePaths: string[] }) =>
          Object.fromEntries(
            filePaths.map((filePath) => [
              filePath,
              filePath === path ? diskContent : null,
            ]),
          ),
        logger,
      } as any)
      expect(stateA.readAuthorizationsByPath?.[path]).toBe(true)

      // Turn 2: a FRESH state B with no hydration (the current bug). The
      // strict gate must block the first edit, forcing a redundant read.
      const stateB = createFileProcessingState()
      stateB.strictReadBeforeEdit = true
      expect(stateB.readAuthorizationsByPath?.[path]).toBeUndefined()

      let applyCount = 0
      const result = await handleStrReplace({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'bug-demo-edit-blocked',
          toolName: 'str_replace',
          input: {
            path,
            replacements: [
              {
                oldString: 'export const value = 1',
                newString: 'export const value = 2',
                allowMultiple: false,
              },
            ],
          },
        },
        fileProcessingState: stateB,
        logger,
        requestOptionalFile: async ({ filePath }: { filePath: string }) =>
          filePath === path ? diskContent : null,
        requestClientToolCall: async (toolCall: any) => {
          applyCount += 1
          return [
            {
              type: 'json' as const,
              value: { file: toolCall.input.path, message: 'applied' },
            },
          ]
        },
        writeToClient: () => {},
      } as any)

      // Without hydration, the strict gate blocks the edit. The client is
      // never invoked and the error message points at the missing read.
      expect(applyCount).toBe(0)
      const output = result.output[0]
      expect(output.type).toBe('json')
      if (output.type === 'json') {
        const value = output.value as { file?: string; errorMessage?: string }
        expect(value.file).toBe(path)
        expect(String(value.errorMessage)).toContain(
          'strict read-before-edit is enabled',
        )
      }
    })
  })
})

// === End-to-end cross-turn test for processStream → read_files → str_replace ===
// Reproduces the user-reported failure mode: reading in turn N does not
// grant authorization for editing in turn N+1, because each processStream
// invocation used to create a fresh fileProcessingState. The fix persists
// readAuthorizationsByPath on agentState across LLM turns.

describe('processStream cross-turn read-before-edit', () => {
  const testAgentTemplate: AgentTemplate = {
    id: 'test-agent',
    displayName: 'Test Agent',
    spawnerPrompt: 'Test agent',
    model: 'claude-3-5-sonnet-20241022',
    inputSchema: {},
    outputMode: 'structured_output',
    includeMessageHistory: true,
    inheritParentSystemPrompt: false,
    mcpServers: {},
    toolNames: ['read_files', 'str_replace', 'end_turn'],
    spawnableAgents: [],
    systemPrompt: 'Test system prompt',
    instructionsPrompt: 'Test instructions',
    stepPrompt: 'Test step prompt',
  }

  it('persists read auth across consecutive processStream invocations (cross-turn)', async () => {
    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState
    const targetPath = 'src/example.ts'
    const diskContent = 'export const value = 1\n'

    let appliedPatches: string[] = []

    const agentRuntimeImpl = {
      ...TEST_AGENT_RUNTIME_IMPL,
      sendAction: () => {},
      requestFiles: async () => ({ [targetPath]: diskContent }),
      requestOptionalFile: async ({ filePath }: { filePath: string }) =>
        filePath === targetPath ? diskContent : null,
      // requestClientToolCall is intentionally not mocked: the
      // executeToolCall wrapper in tool-executor.ts installs its own
      // requestClientToolCall closure that delegates to requestToolCall,
      // so mocking only requestToolCall exercises the real cross-turn path
      // without intercepting the wrapper.
      requestToolCall: async (params: any) => {
        if (
          params.toolName === 'str_replace' ||
          params.toolName === 'write_file'
        ) {
          appliedPatches.push(params.input?.content ?? '')
        }
        return {
          output:
            params.toolName === 'str_replace' ||
            params.toolName === 'write_file'
              ? confirmedMutationOutput({
                  toolCallId: `client-${params.toolName}`,
                  input: params.input,
                })
              : [],
        }
      },
    } as AgentRuntimeDeps & AgentRuntimeScopedDeps

    // Turn 1: read_files should grant authorization on agentState.
    const stream1 = createMockStreamWithToolCalls([
      'Reading the file now.',
      { toolName: 'read_files', input: { paths: [targetPath] } },
      { toolName: 'end_turn', input: {} },
    ])

    await processStream({
      ...agentRuntimeImpl,
      agentContext: {},
      agentState,
      agentStepId: 'turn-1',
      agentTemplate: testAgentTemplate,
      ancestorRunIds: [],
      clientSessionId: 'test-session',
      fileContext: mockFileContext,
      fingerprintId: 'test-fingerprint',
      fullResponse: '',
      localAgentTemplates: { 'test-agent': testAgentTemplate },
      messages: [],
      prompt: 'test prompt',
      repoId: undefined,
      repoUrl: undefined,
      runId: 'test-run-id',
      signal: new AbortController().signal,
      stream: stream1,
      system: 'test system',
      tools: {},
      userId: 'test-user',
      userInputId: 'test-input-id',
      onCostCalculated: async () => {},
      onResponseChunk: () => {},
    })

    // After turn 1: agentState must carry the read authorization forward.
    expect(agentState.readAuthorizationsByPath?.[targetPath]).toBe(true)
    expect(agentState.readAuthorizationHashesByPath?.[targetPath]).toBe(
      getContentHash(diskContent),
    )

    // Turn 2: str_replace on the same path must succeed without re-reading.
    const stream2 = createMockStreamWithToolCalls([
      'Editing the file now.',
      {
        toolName: 'str_replace',
        input: {
          path: targetPath,
          replacements: [
            {
              oldString: 'export const value = 1',
              newString: 'export const value = 2',
              allowMultiple: false,
            },
          ],
        },
      },
      { toolName: 'end_turn', input: {} },
    ])

    await processStream({
      ...agentRuntimeImpl,
      agentContext: {},
      agentState,
      agentStepId: 'turn-2',
      agentTemplate: testAgentTemplate,
      ancestorRunIds: [],
      clientSessionId: 'test-session',
      fileContext: mockFileContext,
      fingerprintId: 'test-fingerprint',
      fullResponse: '',
      localAgentTemplates: { 'test-agent': testAgentTemplate },
      messages: agentState.messageHistory,
      prompt: 'test prompt',
      repoId: undefined,
      repoUrl: undefined,
      runId: 'test-run-id',
      signal: new AbortController().signal,
      stream: stream2,
      system: 'test system',
      tools: {},
      userId: 'test-user',
      userInputId: 'test-input-id',
      onCostCalculated: async () => {},
      onResponseChunk: () => {},
    })

    // The edit must have been applied (no strict-gate block, no re-read needed).
    expect(appliedPatches).toHaveLength(1)
    expect(appliedPatches[0]).toContain('export const value = 2')
    expect(agentState.readAuthorizationHashesByPath?.[targetPath]).toBe(
      getContentHash('export const value = 2\n'),
    )
  })

  it('removes stale durable authorization during cross-turn writeback', async () => {
    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState
    const targetPath = 'src/externally-changed.ts'
    const previouslyReadContent = 'export const value = 1\n'
    const diskContent = 'export const value = 2\n'
    agentState.readAuthorizationsByPath = { [targetPath]: true }
    agentState.readAuthorizationHashesByPath = {
      [targetPath]: getContentHash(previouslyReadContent),
    }
    let applyCount = 0

    const agentRuntimeImpl = {
      ...TEST_AGENT_RUNTIME_IMPL,
      sendAction: () => {},
      requestFiles: async () => ({ [targetPath]: diskContent }),
      requestOptionalFile: async ({ filePath }: { filePath: string }) =>
        filePath === targetPath ? diskContent : null,
      requestToolCall: async () => {
        applyCount += 1
        return { output: [] }
      },
    } as AgentRuntimeDeps & AgentRuntimeScopedDeps

    const stream = createMockStreamWithToolCalls([
      {
        toolName: 'str_replace',
        input: {
          path: targetPath,
          replacements: [
            {
              oldString: 'export const value = 1',
              newString: 'export const value = 3',
              allowMultiple: false,
            },
          ],
        },
      },
      { toolName: 'end_turn', input: {} },
    ])

    await processStream({
      ...agentRuntimeImpl,
      agentContext: {},
      agentState,
      agentStepId: 'stale-turn',
      agentTemplate: testAgentTemplate,
      ancestorRunIds: [],
      clientSessionId: 'test-session',
      fileContext: mockFileContext,
      fingerprintId: 'test-fingerprint',
      fullResponse: '',
      localAgentTemplates: { 'test-agent': testAgentTemplate },
      messages: [],
      prompt: 'test prompt',
      repoId: undefined,
      repoUrl: undefined,
      runId: 'test-run-id',
      signal: new AbortController().signal,
      stream,
      system: 'test system',
      tools: {},
      userId: 'test-user',
      userInputId: 'test-input-id',
      onCostCalculated: async () => {},
      onResponseChunk: () => {},
    })

    expect(applyCount).toBe(0)
    expect(agentState.readAuthorizationsByPath?.[targetPath]).toBeUndefined()
    expect(
      agentState.readAuthorizationHashesByPath?.[targetPath],
    ).toBeUndefined()
  })
})
