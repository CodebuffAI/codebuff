import { describe, expect, it } from 'bun:test'

import { handleReadFiles } from '../tools/handlers/tool/read-files'
import { handleStrReplace } from '../tools/handlers/tool/str-replace'
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
