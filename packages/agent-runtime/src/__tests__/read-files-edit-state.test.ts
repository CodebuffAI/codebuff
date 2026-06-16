import { describe, expect, it } from 'bun:test'

import { handleEditTransaction } from '../tools/handlers/tool/edit-transaction'
import { handleReadFiles } from '../tools/handlers/tool/read-files'
import { handleStrReplace } from '../tools/handlers/tool/str-replace'
import { handleWriteFile } from '../tools/handlers/tool/write-file'
import { encodeReadCapabilityToken, getContentHash } from '../process-str-replace'
import { mockFileContext } from './test-utils'

import type { FileProcessingState } from '../tools/handlers/tool/write-file'
import type { Logger } from '@codebuff/common/types/contracts/logger'

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
  }
}

describe('read_files edit-state recovery', () => {
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

    expect(fileProcessingState.failedEditRequiresReadByPath[path]).toBeUndefined()
    expect(fileProcessingState.promisesByPath[path]).toBeUndefined()

    expect(result.output[0]?.type).toBe('json')
    if (result.output[0]?.type === 'json') {
      expect(result.output[0].value).toEqual([
        {
          summary: {
            ok: 1,
            failed: 0,
            requested: 1,
          },
        },
        {
          path,
          content: diskContent,
          referencedBy: {},
        },
      ])
    }
  })

  it('does not crash when str_replace client returns an empty result', async () => {
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
        message?: string
        patch?: string
        unifiedDiff?: string
      }
      expect(value.file).toBe(path)
      expect(value.message).toBe(
        'Applied str_replace patch; synthesized result because the client returned an empty response.',
      )
      expect(value.patch).toBe(appliedPatches[0])
      expect(value.unifiedDiff).toBe(appliedPatches[0])
    }
  })

  it('synthesizes a successful write_file result when the client returns empty after applying', async () => {
    const path = 'packages/agent-runtime/src/util/render-read-files-result.ts'
    const diskContent = 'export const value = 1\n'
    const newContent = 'export const value = 2\n'
    const fileProcessingState = createFileProcessingState()
    const appliedPatches: string[] = []

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
        message?: string
        patch?: string
        unifiedDiff?: string
      }
      expect(value.file).toBe(path)
      expect(value.message).toBe(
        'Applied write_file edit; synthesized result because the client returned an empty response.',
      )
      expect(value.patch).toBe(appliedPatches[0])
      expect(value.unifiedDiff).toBe(appliedPatches[0])
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
        return [
          {
            type: 'json' as const,
            value: {
              message: 'applied transaction batch',
              files: toolCall.input.map((change: { path: string; content: string }) => ({
                path: change.path,
                patch: change.content,
                messages: [],
              })),
            },
          },
        ]
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
        return [
          {
            type: 'json' as const,
            value: {
              message: 'applied transaction batch',
              files: toolCall.input.map((change: { path: string; content: string }) => ({
                path: change.path,
                patch: change.content,
                messages: [],
              })),
            },
          },
        ]
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
      expect(String((replaceOutput.value as { errorMessage?: string }).errorMessage)).toContain(
        'previous str_replace failed for this file',
      )
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
    expect(fileProcessingState.failedEditRequiresReadByPath[otherPath]).toBe(true)

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
      expect(String((replaceOutput.value as { errorMessage?: string }).errorMessage)).toContain(
        'previous str_replace failed for this file',
      )
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
        return [
          {
            type: 'json' as const,
            value: {
              message: 'applied transaction batch',
              files: toolCall.input.map(
                (change: { path: string; content: string }) => ({
                  path: change.path,
                  patch: change.content,
                  messages: [],
                }),
              ),
            },
          },
        ]
      },
    } as any)

    const output = transactionResult.output[0]
    expect(output.type).toBe('json')
    if (output.type === 'json') {
      expect(output.value).not.toHaveProperty('errorMessage')
    }
    expect(appliedPatch).toContain("import type { KeyEvent } from '@opentui/core'")
    expect(fileProcessingState.failedEditRequiresReadByPath[path]).toBeUndefined()
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
                  newString: "import React from 'react'\nimport { Broken } { Extra } from 'mod'\n",
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
      expect(value.errorMessage).toContain('Do NOT resubmit the same edit_transaction')
      expect(value.errorMessage).toContain('insert_import/remove_import')
    }
    expect(fileProcessingState.failedEditRequiresReadByPath[path]).toBe(true)
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
      expect(String((output.value as { errorMessage?: string }).errorMessage)).toContain(
        'client apply threw',
      )
    }
    expect(fileProcessingState.promisesByPath[path]).toBeUndefined()
    expect(fileProcessingState.promisesByPath[otherPath]).toBeUndefined()
    expect(fileProcessingState.failedEditRequiresReadByPath[path]).toBe(true)
    expect(fileProcessingState.failedEditRequiresReadByPath[otherPath]).toBe(true)
  })

  it('uses current disk content for basedOnRead even when stale per-path edit content remains', async () => {
    const path = 'agents/editor/best-of-n/editor-multi-prompt.ts'
    const staleContent = Array.from({ length: 2_889 }, (_, index) =>
      `const stale${index} = ${index};`,
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

    const output = strReplaceResult.output[0]
    expect(output.type).toBe('json')
    if (output.type === 'json') {
      expect(output.value).not.toHaveProperty('errorMessage')
      expect(requestOptionalFileLineCount).toBe(4_499)
      expect(appliedPatchContent).toContain('-const target = 1;')
      expect(appliedPatchContent).toContain('+const target = 2;')
    }
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
    const requestFiles = async ({
      filePaths,
    }: {
      filePaths: string[]
      ranges?: Array<{ path: string; startLine?: number; endLine?: number }>
    }) =>
      Object.fromEntries(
        filePaths.map((filePath) => [
          filePath,
          filePath === path ? diskContent : null,
        ]),
      )

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

    expect(fileProcessingState.failedEditRequiresReadByPath[path]).toBeUndefined()
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

    const output = strReplaceResult.output[0]
    expect(output.type).toBe('json')
    if (output.type === 'json') {
      expect(output.value).not.toHaveProperty('errorMessage')
      expect(output.value).toMatchObject({ file: path })
      expect(String((output.value as { message?: string }).message)).toContain(
        'applied',
      )
      expect(appliedPatchContent).toContain('-const target = 1;')
      expect(appliedPatchContent).toContain('+const target = 2;')
    }
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
})
