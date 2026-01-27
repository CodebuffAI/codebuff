import { getStubProjectFileContext } from '@codebuff/common/util/file'
import { describe, it, expect } from 'bun:test'

import { handleReadSubtree } from '../tool/read-subtree'

import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

// Type for read_subtree result entries
interface ReadSubtreeResultEntry {
  type: 'directory' | 'file'
  path: string
  printedTree?: string
  tokenCount?: number
  truncationLevel?: 'none' | 'unimportant-files' | 'tokens' | 'depth-based'
  variables?: string[]
  errorMessage?: string
}

function createLogger(): Logger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }
}

function buildMockFileContext() {
  const ctx = getStubProjectFileContext()
  ctx.fileTree = [
    {
      name: 'src',
      type: 'directory',
      filePath: 'src',
      children: [
        {
          name: 'index.ts',
          type: 'file',
          filePath: 'src/index.ts',
          lastReadTime: 0,
        },
        {
          name: 'util.ts',
          type: 'file',
          filePath: 'src/util.ts',
          lastReadTime: 0,
        },
      ],
    },
    {
      name: 'package.json',
      type: 'file',
      filePath: 'package.json',
      lastReadTime: 0,
    },
  ]
  ctx.fileTokenScores = {
    'src/index.ts': { beta: 2.0, alpha: 1.0 },
    'src/util.ts': { helper: 3.0 },
    'package.json': {},
  }
  return ctx
}

describe('handleReadSubtree', () => {
  it('returns a directory subtree blob with tokens for a directory path', async () => {
    const fileContext = buildMockFileContext()
    const logger = createLogger()

    const toolCall: CodebuffToolCall<'read_subtree'> = {
      toolName: 'read_subtree',
      toolCallId: 'tc-1',
      input: { paths: ['src'], maxTokens: 50000 },
    }

    const { output } = await handleReadSubtree({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext,
      logger,
    })

    expect(Array.isArray(output)).toBe(true)
    expect(output[0].type).toBe('json')
    const value = output[0].value as ReadSubtreeResultEntry[]
    const dirEntry = value.find(
      (v) => v.type === 'directory' && v.path === 'src',
    )
    expect(dirEntry).toBeTruthy()
    expect(typeof dirEntry!.printedTree).toBe('string')
    expect(dirEntry!.printedTree).toContain('src/')
    expect(dirEntry!.printedTree).toContain('index.ts')
    expect(typeof dirEntry!.tokenCount).toBe('number')
    expect(
      ['none', 'unimportant-files', 'tokens', 'depth-based'].includes(
        dirEntry!.truncationLevel ?? '',
      ),
    ).toBe(true)
  })

  it('returns parsed variable names for a file path', async () => {
    const fileContext = buildMockFileContext()
    const logger = createLogger()

    const toolCall: CodebuffToolCall<'read_subtree'> = {
      toolName: 'read_subtree',
      toolCallId: 'tc-2',
      input: { paths: ['src/index.ts'], maxTokens: 50000 },
    }

    const { output } = await handleReadSubtree({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext,
      logger,
    })

    expect(output[0].type).toBe('json')
    const value = output[0].value as ReadSubtreeResultEntry[]
    const fileEntry = value.find(
      (v) => v.type === 'file' && v.path === 'src/index.ts',
    )
    expect(fileEntry).toBeTruthy()
    expect(Array.isArray(fileEntry!.variables)).toBe(true)
    // Sorted by descending score: beta (2.0) before alpha (1.0)
    expect(fileEntry!.variables![0]).toBe('beta')
    expect(fileEntry!.variables).toContain('alpha')
  })

  it('returns an error object for a missing path', async () => {
    const fileContext = buildMockFileContext()
    const logger = createLogger()

    const toolCall: CodebuffToolCall<'read_subtree'> = {
      toolName: 'read_subtree',
      toolCallId: 'tc-3',
      input: { paths: ['does-not-exist'], maxTokens: 50000 },
    }

    const { output } = await handleReadSubtree({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext,
      logger,
    })

    expect(output[0].type).toBe('json')
    const value = output[0].value as ReadSubtreeResultEntry[]
    const errEntry = value.find(
      (v) => v.path === 'does-not-exist' && v.errorMessage,
    )
    expect(errEntry).toBeTruthy()
    expect(String(errEntry!.errorMessage)).toContain('Path not found or ignored')
  })

  it('includes variables when reading a subdirectory with proper path mapping', async () => {
    const fileContext = buildMockFileContext()
    const logger = createLogger()

    // Test with a deeper nested structure to expose potential path issues
    fileContext.fileTree = [
      {
        name: 'packages',
        type: 'directory',
        filePath: 'packages',
        children: [
          {
            name: 'backend',
            type: 'directory',
            filePath: 'packages/backend',
            children: [
              {
                name: 'index.ts',
                type: 'file',
                filePath: 'packages/backend/index.ts',
                lastReadTime: 0,
              },
            ],
          },
        ],
      },
    ]
    fileContext.fileTokenScores = {
      'packages/backend/index.ts': { myFunction: 5.0, myClass: 3.0 },
    }

    const toolCall: CodebuffToolCall<'read_subtree'> = {
      toolName: 'read_subtree',
      toolCallId: 'tc-subdir',
      input: { paths: ['packages/backend'], maxTokens: 50000 },
    }

    const { output } = await handleReadSubtree({
      previousToolCallFinished: Promise.resolve(),
      toolCall,
      fileContext,
      logger,
    })

    expect(output[0].type).toBe('json')
    const value = output[0].value as ReadSubtreeResultEntry[]
    const dirEntry = value.find(
      (v) => v.type === 'directory' && v.path === 'packages/backend',
    )
    expect(dirEntry).toBeTruthy()
    expect(typeof dirEntry!.printedTree).toBe('string')

    // The printedTree should include the variable names from fileTokenScores
    expect(dirEntry!.printedTree).toContain('myFunction')
    expect(dirEntry!.printedTree).toContain('myClass')
  })

  it('honors maxTokens by reducing token count under a tiny budget', async () => {
    const fileContext = buildMockFileContext()
    const logger = createLogger()

    // Large budget (baseline)
    const largeToolCall: CodebuffToolCall<'read_subtree'> = {
      toolName: 'read_subtree',
      toolCallId: 'tc-4a',
      input: { paths: ['src'], maxTokens: 50000 },
    }
    const { output: largeOutput } = await handleReadSubtree({
      previousToolCallFinished: Promise.resolve(),
      toolCall: largeToolCall,
      fileContext,
      logger,
    })
    expect(largeOutput[0].type).toBe('json')
    const largeValue = largeOutput[0].value as ReadSubtreeResultEntry[]
    const largeDirEntry = largeValue.find(
      (v) => v.type === 'directory' && v.path === 'src',
    )
    expect(largeDirEntry).toBeTruthy()

    // Tiny budget
    const tinyBudget = 5
    const smallToolCall: CodebuffToolCall<'read_subtree'> = {
      toolName: 'read_subtree',
      toolCallId: 'tc-4b',
      input: { paths: ['src'], maxTokens: tinyBudget },
    }
    const { output: smallOutput } = await handleReadSubtree({
      previousToolCallFinished: Promise.resolve(),
      toolCall: smallToolCall,
      fileContext,
      logger,
    })
    expect(smallOutput[0].type).toBe('json')
    const smallValue = smallOutput[0].value as ReadSubtreeResultEntry[]
    const smallDirEntry = smallValue.find(
      (v) => v.type === 'directory' && v.path === 'src',
    )
    expect(smallDirEntry).toBeTruthy()

    // Must honor the tiny budget
    expect(typeof smallDirEntry!.tokenCount).toBe('number')
    expect(smallDirEntry!.tokenCount).toBeLessThanOrEqual(tinyBudget)

    // Typically, token count under tiny budget should be <= baseline
    expect(smallDirEntry!.tokenCount).toBeLessThanOrEqual(
      largeDirEntry!.tokenCount!,
    )
  })
})
