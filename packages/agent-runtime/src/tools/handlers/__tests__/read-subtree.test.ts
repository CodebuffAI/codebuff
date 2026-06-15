import * as nodeFs from 'fs'
import * as nodeOs from 'os'
import * as nodePath from 'path'

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
    // The path 'does-not-exist' does not exist on disk under the (stubbed,
    // empty) project root, so we should get the not-found-on-disk message.
    expect(String(errEntry!.errorMessage)).toContain('Path not found')
    expect(String(errEntry!.errorMessage)).toContain('does-not-exist')
  })

  it('supplements the default root subtree with files created after the tree snapshot', async () => {
    const fileContext = buildMockFileContext()
    const logger = createLogger()

    const tmpRoot = nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), 'openbuff-read-subtree-test-'),
    )
    try {
      nodeFs.mkdirSync(nodePath.join(tmpRoot, 'src'))
      nodeFs.writeFileSync(nodePath.join(tmpRoot, 'src', 'index.ts'), 'export {}')
      nodeFs.writeFileSync(nodePath.join(tmpRoot, 'root-new.ts'), 'export {}')
      fileContext.projectRoot = tmpRoot

      const toolCall: CodebuffToolCall<'read_subtree'> = {
        toolName: 'read_subtree',
        toolCallId: 'tc-root-live-supplement',
        input: { paths: [], maxTokens: 50000 },
      }

      const { output } = await handleReadSubtree({
        previousToolCallFinished: Promise.resolve(),
        toolCall,
        fileContext,
        logger,
      })

      const value = output[0].value as ReadSubtreeResultEntry[]
      const rootEntry = value.find(
        (v) => v.path === '.' && v.type === 'directory',
      )
      expect(rootEntry).toBeTruthy()
      expect(rootEntry!.printedTree).toContain('src/')
      expect(rootEntry!.printedTree).toContain('root-new.ts')
      expect(rootEntry!.printedTree).toContain('package.json')
    } finally {
      nodeFs.rmSync(tmpRoot, { recursive: true, force: true })
    }
  })

  it('live-reads paths that exist on disk but are missing from the cached tree', async () => {
    const fileContext = buildMockFileContext()
    const logger = createLogger()

    // Point projectRoot at a real directory. The cached fileTree intentionally
    // does not include this path, simulating an untracked / post-snapshot file.
    const tmpRoot = nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), 'openbuff-read-subtree-test-'),
    )
    try {
      const untrackedDir = nodePath.join(tmpRoot, 'untracked-dir')
      nodeFs.mkdirSync(untrackedDir)
      nodeFs.writeFileSync(nodePath.join(untrackedDir, 'a.ts'), 'export {}')
      fileContext.projectRoot = tmpRoot

      const toolCall: CodebuffToolCall<'read_subtree'> = {
        toolName: 'read_subtree',
        toolCallId: 'tc-untracked',
        input: { paths: ['untracked-dir'], maxTokens: 50000 },
      }

      const { output } = await handleReadSubtree({
        previousToolCallFinished: Promise.resolve(),
        toolCall,
        fileContext,
        logger,
      })

      const value = output[0].value as ReadSubtreeResultEntry[]
      const dirEntry = value.find(
        (v) => v.path === 'untracked-dir' && v.type === 'directory',
      )
      expect(dirEntry).toBeTruthy()
      expect(dirEntry!.printedTree).toContain('untracked-dir/')
      expect(dirEntry!.printedTree).toContain('a.ts')
    } finally {
      nodeFs.rmSync(tmpRoot, { recursive: true, force: true })
    }
  })

  it('supplements cached directories with files created after the tree snapshot', async () => {
    const fileContext = buildMockFileContext()
    const logger = createLogger()

    const tmpRoot = nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), 'openbuff-read-subtree-test-'),
    )
    try {
      const srcDir = nodePath.join(tmpRoot, 'src')
      nodeFs.mkdirSync(srcDir)
      nodeFs.writeFileSync(nodePath.join(srcDir, 'index.ts'), 'export {}')
      nodeFs.writeFileSync(nodePath.join(srcDir, 'new.ts'), 'export {}')
      fileContext.projectRoot = tmpRoot

      const toolCall: CodebuffToolCall<'read_subtree'> = {
        toolName: 'read_subtree',
        toolCallId: 'tc-cached-dir-live-supplement',
        input: { paths: ['src'], maxTokens: 50000 },
      }

      const { output } = await handleReadSubtree({
        previousToolCallFinished: Promise.resolve(),
        toolCall,
        fileContext,
        logger,
      })

      const value = output[0].value as ReadSubtreeResultEntry[]
      const dirEntry = value.find(
        (v) => v.path === 'src' && v.type === 'directory',
      )
      expect(dirEntry).toBeTruthy()
      expect(dirEntry!.printedTree).toContain('index.ts')
      expect(dirEntry!.printedTree).toContain('new.ts')
      expect(dirEntry!.printedTree).toContain('util.ts')
      expect(dirEntry!.printedTree).toContain('helper')
    } finally {
      nodeFs.rmSync(tmpRoot, { recursive: true, force: true })
    }
  })

  it('does not reveal existence of absolute or parent-directory paths', async () => {
    const fileContext = buildMockFileContext()
    const logger = createLogger()

    const tmpRoot = nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), 'openbuff-read-subtree-test-'),
    )
    const outsideRoot = nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), 'openbuff-read-subtree-outside-'),
    )
    try {
      nodeFs.writeFileSync(nodePath.join(outsideRoot, 'secret.txt'), 'secret')
      fileContext.projectRoot = tmpRoot

      const toolCall: CodebuffToolCall<'read_subtree'> = {
        toolName: 'read_subtree',
        toolCallId: 'tc-escape',
        input: {
          paths: [
            nodePath.join(outsideRoot, 'secret.txt'),
            nodePath.relative(tmpRoot, nodePath.join(outsideRoot, 'secret.txt')),
          ],
          maxTokens: 50000,
        },
      }

      const { output } = await handleReadSubtree({
        previousToolCallFinished: Promise.resolve(),
        toolCall,
        fileContext,
        logger,
      })

      const value = output[0].value as ReadSubtreeResultEntry[]
      expect(value).toHaveLength(2)
      for (const entry of value) {
        expect(entry.errorMessage).toContain('Path not found')
        expect(entry.errorMessage).not.toContain('exists on disk')
        expect(entry.type).toBeUndefined()
      }
    } finally {
      nodeFs.rmSync(tmpRoot, { recursive: true, force: true })
      nodeFs.rmSync(outsideRoot, { recursive: true, force: true })
    }
  })

  it('does not follow in-project symlinks that point outside the project root', async () => {
    const fileContext = buildMockFileContext()
    const logger = createLogger()

    const tmpRoot = nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), 'openbuff-read-subtree-test-'),
    )
    const outsideRoot = nodeFs.mkdtempSync(
      nodePath.join(nodeOs.tmpdir(), 'openbuff-read-subtree-outside-'),
    )
    try {
      const liveDir = nodePath.join(tmpRoot, 'live-dir')
      nodeFs.mkdirSync(liveDir)
      nodeFs.writeFileSync(nodePath.join(liveDir, 'safe.ts'), 'export {}')
      nodeFs.writeFileSync(nodePath.join(outsideRoot, 'secret.txt'), 'secret')
      nodeFs.symlinkSync(outsideRoot, nodePath.join(liveDir, 'link-outside'))
      fileContext.projectRoot = tmpRoot

      const toolCall: CodebuffToolCall<'read_subtree'> = {
        toolName: 'read_subtree',
        toolCallId: 'tc-symlink-escape',
        input: { paths: ['live-dir', 'live-dir/link-outside'], maxTokens: 50000 },
      }

      const { output } = await handleReadSubtree({
        previousToolCallFinished: Promise.resolve(),
        toolCall,
        fileContext,
        logger,
      })

      const value = output[0].value as ReadSubtreeResultEntry[]
      const dirEntry = value.find(
        (v) => v.path === 'live-dir' && v.type === 'directory',
      )
      expect(dirEntry).toBeTruthy()
      expect(dirEntry!.printedTree).toContain('safe.ts')
      expect(dirEntry!.printedTree).not.toContain('link-outside')
      expect(dirEntry!.printedTree).not.toContain('secret.txt')

      const linkEntry = value.find((v) => v.path === 'live-dir/link-outside')
      expect(linkEntry).toBeTruthy()
      expect(linkEntry!.errorMessage).toContain('Path not found')
      expect(linkEntry!.errorMessage).not.toContain('exists on disk')
      expect(linkEntry!.type).toBeUndefined()
    } finally {
      nodeFs.rmSync(tmpRoot, { recursive: true, force: true })
      nodeFs.rmSync(outsideRoot, { recursive: true, force: true })
    }
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

  it('resolves directory paths with trailing slashes', async () => {
    const fileContext = buildMockFileContext()
    const logger = createLogger()

    const toolCall: CodebuffToolCall<'read_subtree'> = {
      toolName: 'read_subtree',
      toolCallId: 'tc-trailing-slash',
      input: { paths: ['src/'], maxTokens: 50000 },
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
      (v) => v.type === 'directory' && v.path === 'src',
    )
    expect(dirEntry).toBeTruthy()
    expect(dirEntry!.printedTree).toContain('index.ts')
  })

  it('resolves nested directory paths with trailing slashes', async () => {
    const fileContext = buildMockFileContext()
    const logger = createLogger()

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
      'packages/backend/index.ts': { myFunction: 5.0 },
    }

    const toolCall: CodebuffToolCall<'read_subtree'> = {
      toolName: 'read_subtree',
      toolCallId: 'tc-nested-trailing-slash',
      input: { paths: ['packages/backend/'], maxTokens: 50000 },
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
    expect(dirEntry!.printedTree).toContain('myFunction')
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
