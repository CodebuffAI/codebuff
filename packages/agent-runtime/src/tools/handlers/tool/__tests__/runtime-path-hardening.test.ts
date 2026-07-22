import { describe, expect, it } from 'bun:test'

import { handleEditTransaction } from '../edit-transaction'
import { handleApplyPatch } from '../apply-patch'
import { handleReadFiles } from '../read-files'
import { handleReplaceRange } from '../replace-range'
import { handleRewriteSymbol } from '../rewrite-symbol'
import { handleStrReplace } from '../str-replace'
import {
  getFileProcessingValues,
  handleWriteFile,
  normalizeToolPath,
} from '../write-file'
import {
  encodeReadCapabilityToken,
  getContentHash,
} from '@codebuff/common/util/content-hash'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

const unsafePaths = [
  '',
  '.',
  './',
  '   ',
  '../secret.txt',
  'src/../../secret.txt',
  '..\\secret.txt',
  '/etc/passwd',
  'C:/Windows/System32/config',
  'C:\\Windows\\System32\\config',
  'C:Windows\\System32\\config',
  '\\\\server\\share\\secret.txt',
  '\\\\?\\C:\\secret.txt',
  'src/evil\0name.ts',
]

function expectUnsafePathError(result: { output: any[] }, inputPath: string) {
  expect(result.output[0]?.type).toBe('json')
  expect(result.output[0]?.value).toMatchObject({
    file: inputPath,
  })
  expect(String(result.output[0]?.value?.errorMessage)).toContain(
    'path traversal blocked',
  )
}

describe('runtime tool path hardening', () => {
  it('normalizes safe project-relative paths and rejects unsafe forms', () => {
    expect(normalizeToolPath('./src\\nested/./file.ts')).toBe(
      'src/nested/file.ts',
    )
    expect(normalizeToolPath('src//nested///file.ts')).toBe(
      'src/nested/file.ts',
    )

    for (const inputPath of unsafePaths) {
      expect(normalizeToolPath(inputPath)).toBe('')
    }
  })

  it('blocks write_file and str_replace before any file or client I/O', async () => {
    for (const inputPath of unsafePaths) {
      let ioCalls = 0
      const common = {
        previousToolCallFinished: Promise.resolve(),
        fileProcessingState: getFileProcessingValues({
          strictReadBeforeEdit: false,
        }),
        logger,
        requestOptionalFile: async () => {
          ioCalls += 1
          return 'secret'
        },
        requestClientToolCall: async () => {
          ioCalls += 1
          return []
        },
        writeToClient: () => undefined,
      }

      const writeResult = await handleWriteFile({
        ...common,
        toolCall: {
          toolCallId: 'unsafe-write',
          toolName: 'write_file',
          input: { path: inputPath, content: 'replacement' },
        },
      } as any)
      expectUnsafePathError(writeResult, inputPath)

      const replaceResult = await handleStrReplace({
        ...common,
        toolCall: {
          toolCallId: 'unsafe-replace',
          toolName: 'str_replace',
          input: {
            path: inputPath,
            replacements: [
              {
                oldString: 'secret',
                newString: 'replacement',
                allowMultiple: false,
              },
            ],
          },
        },
      } as any)
      expectUnsafePathError(replaceResult, inputPath)
      expect(ioCalls).toBe(0)
    }
  })

  it('blocks rewrite_symbol before requestOptionalFile', async () => {
    for (const inputPath of unsafePaths) {
      let ioCalls = 0
      const result = await handleRewriteSymbol({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'unsafe-rewrite-symbol',
          toolName: 'rewrite_symbol',
          input: {
            path: inputPath,
            symbol: 'target',
            content: 'function target() {}',
          },
        },
        fileProcessingState: getFileProcessingValues({
          strictReadBeforeEdit: false,
        }),
        logger,
        requestOptionalFile: async () => {
          ioCalls += 1
          return 'function target() {}'
        },
        requestClientToolCall: async () => {
          ioCalls += 1
          return []
        },
        writeToClient: () => undefined,
      } as any)

      expectUnsafePathError(result, inputPath)
      expect(ioCalls).toBe(0)
    }
  })

  it('blocks replace_range and edit_transaction before client or file I/O', async () => {
    for (const inputPath of unsafePaths) {
      let ioCalls = 0
      const fileProcessingState = getFileProcessingValues({
        strictReadBeforeEdit: false,
      })
      const requestClientToolCall = async () => {
        ioCalls += 1
        return []
      }

      const rangeResult = await handleReplaceRange({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'unsafe-range',
          toolName: 'replace_range',
          input: {
            path: inputPath,
            startLine: 1,
            endLine: 1,
            newContent: 'replacement',
          },
        },
        fileProcessingState,
        requestClientToolCall,
      } as any)
      expectUnsafePathError(rangeResult, inputPath)

      const transactionResult = await handleEditTransaction({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'unsafe-transaction',
          toolName: 'edit_transaction',
          input: {
            edits: [
              {
                type: 'str_replace',
                path: inputPath,
                replacements: [
                  {
                    oldString: 'secret',
                    newString: 'replacement',
                    allowMultiple: false,
                  },
                ],
              },
            ],
          },
        },
        fileProcessingState,
        logger,
        requestOptionalFile: async () => {
          ioCalls += 1
          return 'secret'
        },
        requestClientToolCall,
      } as any)
      expect(transactionResult.output[0]?.value).toMatchObject({
        failures: [{ editIndex: 0, path: inputPath }],
      })
      const transactionValue = transactionResult.output[0]?.value as {
        errorMessage?: string
      }
      expect(String(transactionValue.errorMessage)).toContain(
        'path traversal blocked',
      )
      expect(ioCalls).toBe(0)
    }
  })

  it('blocks apply_patch before client I/O', async () => {
    for (const inputPath of unsafePaths) {
      let ioCalls = 0
      const result = await handleApplyPatch({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'unsafe-apply-patch',
          toolName: 'apply_patch',
          input: {
            operation: {
              type: 'update_file',
              path: inputPath,
              diff: '@@\n-old\n+new\n',
            },
          },
        },
        fileProcessingState: getFileProcessingValues({
          strictReadBeforeEdit: false,
        }),
        requestClientToolCall: async () => {
          ioCalls += 1
          return []
        },
      } as any)

      expect(
        String(
          (result.output[0]?.value as { errorMessage?: string } | undefined)
            ?.errorMessage,
        ),
      ).toContain('path traversal blocked')
      expect(ioCalls).toBe(0)
    }
  })

  it('requires a fresh read authorization for apply_patch updates', async () => {
    let clientCalls = 0
    const result = await handleApplyPatch({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'strict-apply-patch',
        toolName: 'apply_patch',
        input: {
          operation: {
            type: 'update_file',
            path: 'src/a.ts',
            diff: '@@\n-old\n+new\n',
          },
        },
      },
      fileProcessingState: getFileProcessingValues({
        strictReadBeforeEdit: true,
      }),
      requestClientToolCall: async () => {
        clientCalls += 1
        return []
      },
    } as any)

    expect(clientCalls).toBe(0)
    expect(result.output[0]?.value).toMatchObject({
      file: 'src/a.ts',
    })
    expect(
      String(
        (result.output[0]?.value as { errorMessage?: string }).errorMessage,
      ),
    ).toContain('strict read-before-edit')
  })

  it('does not let legacy pathless apply_patch ranges authorize an unread path', async () => {
    let clientCalls = 0
    const token = encodeReadCapabilityToken({
      startLine: 1,
      endLine: 1,
      hash: getContentHash('old'),
      scope: { projectId: '/project', path: 'src/other.ts', runId: 'run' },
    })
    const result = await handleApplyPatch({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'strict-legacy-apply-patch',
        toolName: 'apply_patch',
        input: {
          operation: {
            type: 'update_file',
            path: 'src/a.ts',
            diff: '@@\n-old\n+new\n',
            basedOnRead: [token],
          },
        },
      },
      fileContext: { projectRoot: '/project' },
      runId: 'run',
      fileProcessingState: getFileProcessingValues({
        strictReadBeforeEdit: true,
      }),
      requestClientToolCall: async () => {
        clientCalls += 1
        return []
      },
    } as any)

    expect(clientCalls).toBe(0)
    expect(String((result.output[0]?.value as any).errorMessage)).toContain(
      'belongs to a different project, path, or agent run',
    )
  })

  it('accepts and unwraps target-bound cap.v3 apply_patch ranges', async () => {
    const path = 'src/a.ts'
    const projectId = '/project'
    const runId = 'apply-patch-run'
    const hash = getContentHash('old')
    const token = encodeReadCapabilityToken({
      startLine: 1,
      endLine: 1,
      hash,
      scope: { projectId, path, runId },
    })
    let forwardedOperation: any
    const result = await handleApplyPatch({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolCallId: 'strict-scoped-apply-patch',
        toolName: 'apply_patch',
        input: {
          operation: {
            type: 'update_file',
            path,
            diff: '@@\n-old\n+new\n',
            basedOnRead: [token],
          },
        },
      },
      fileContext: { projectRoot: projectId },
      runId,
      fileProcessingState: getFileProcessingValues({
        strictReadBeforeEdit: true,
      }),
      requestClientToolCall: async (toolCall: any) => {
        forwardedOperation = toolCall.input.operation
        return [
          {
            type: 'json' as const,
            value: { file: path, message: 'applied' },
          },
        ]
      },
    } as any)

    expect(forwardedOperation.basedOnRead).toEqual([token])
    expect(result.output[0]?.value).not.toHaveProperty('errorMessage')
  })

  it('blocks a mixed read_files request rather than forwarding an empty path', async () => {
    for (const inputPath of unsafePaths) {
      let ioCalls = 0
      const result = await handleReadFiles({
        previousToolCallFinished: Promise.resolve(),
        toolCall: {
          toolCallId: 'unsafe-read',
          toolName: 'read_files',
          input: {
            paths: ['src/safe.ts'],
            ranges: [{ path: inputPath, startLine: 1, endLine: 1 }],
          },
        },
        fileContext: { tokenCallers: {} },
        fileProcessingState: getFileProcessingValues({}),
        requestFiles: async () => {
          ioCalls += 1
          return {}
        },
        requestOptionalFile: async () => {
          ioCalls += 1
          return null
        },
      } as any)

      expect(result.output[0]?.type).toBe('json')
      const readValue = result.output[0]?.value as {
        status: string
        results: Array<{
          path: string
          status: string
          error?: { message?: string }
        }>
      }
      expect(readValue.status).toBe('error')
      expect(readValue.results[1]?.path).toBe(inputPath)
      expect(readValue.results[1]?.error?.message).toContain(
        'path traversal blocked',
      )
      expect(ioCalls).toBe(0)
    }
  })
})
