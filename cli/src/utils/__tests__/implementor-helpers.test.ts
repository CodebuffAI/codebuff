import { describe, expect, test } from 'bun:test'
import {
  extractValueForKey,
  extractFilePath,
  extractDiff,
  parseDiffStats,
  getFileChangeType,
  getFileStatsFromBlocks,
  buildActivityTimeline,
  isImplementorAgent,
  getImplementorDisplayName,
  getImplementorIndex,
} from '../implementor-helpers'
import type { ToolContentBlock, ContentBlock, AgentContentBlock, TextContentBlock } from '../../types/chat'

describe('extractValueForKey', () => {
  test('extracts simple key-value pairs', () => {
    const output = 'file: src/utils/helper.ts\nmessage: Updated file'
    expect(extractValueForKey(output, 'file')).toBe('src/utils/helper.ts')
    expect(extractValueForKey(output, 'message')).toBe('Updated file')
  })

  test('handles quoted values', () => {
    const output = 'message: "Created new file"'
    expect(extractValueForKey(output, 'message')).toBe('Created new file')
  })

  test('returns null for missing keys', () => {
    const output = 'file: test.ts'
    expect(extractValueForKey(output, 'nonexistent')).toBeNull()
  })

  test('handles empty output', () => {
    expect(extractValueForKey('', 'file')).toBeNull()
  })

  test('handles multi-line values with pipe', () => {
    const output = `unifiedDiff: |
  - old line
  + new line`
    const result = extractValueForKey(output, 'unifiedDiff')
    expect(result).toBe('- old line\n+ new line')
  })
})

describe('extractFilePath', () => {
  test('extracts from output string', () => {
    const block: ToolContentBlock = {
      type: 'tool',
      toolCallId: 'test-1',
      toolName: 'str_replace',
      input: {},
      output: 'file: src/utils/test.ts\nmessage: Updated',
    }
    expect(extractFilePath(block)).toBe('src/utils/test.ts')
  })

  test('extracts from input.path', () => {
    const block: ToolContentBlock = {
      type: 'tool',
      toolCallId: 'test-1',
      toolName: 'str_replace',
      input: { path: 'src/components/Button.tsx' },
      output: '',
    }
    expect(extractFilePath(block)).toBe('src/components/Button.tsx')
  })

  test('prefers output over input', () => {
    const block: ToolContentBlock = {
      type: 'tool',
      toolCallId: 'test-1',
      toolName: 'str_replace',
      input: { path: 'input-path.ts' },
      output: 'file: output-path.ts',
    }
    expect(extractFilePath(block)).toBe('output-path.ts')
  })
})

describe('extractDiff', () => {
  test('extracts from outputRaw array format', () => {
    const block: ToolContentBlock = {
      type: 'tool',
      toolCallId: 'test-1',
      toolName: 'str_replace',
      input: {},
      outputRaw: [{ type: 'json', value: { unifiedDiff: '- old\n+ new' } }],
    }
    expect(extractDiff(block)).toBe('- old\n+ new')
  })

  test('constructs diff from str_replace input', () => {
    const block: ToolContentBlock = {
      type: 'tool',
      toolCallId: 'test-1',
      toolName: 'str_replace',
      input: {
        replacements: [
          { old: 'const x = 1', new: 'const x = 2' }
        ]
      },
    }
    const diff = extractDiff(block)
    expect(diff).toContain('- const x = 1')
    expect(diff).toContain('+ const x = 2')
  })

  test('constructs diff from write_file input', () => {
    const block: ToolContentBlock = {
      type: 'tool',
      toolCallId: 'test-1',
      toolName: 'write_file',
      input: { content: 'line1\nline2' },
    }
    const diff = extractDiff(block)
    expect(diff).toBe('+ line1\n+ line2')
  })

  test('constructs diff from propose_str_replace input', () => {
    const block: ToolContentBlock = {
      type: 'tool',
      toolCallId: 'test-1',
      toolName: 'propose_str_replace',
      input: {
        replacements: [
          { old: 'const x = 1', new: 'const x = 2' }
        ]
      },
    }
    const diff = extractDiff(block)
    expect(diff).toContain('- const x = 1')
    expect(diff).toContain('+ const x = 2')
  })

  test('constructs diff from propose_write_file input', () => {
    const block: ToolContentBlock = {
      type: 'tool',
      toolCallId: 'test-1',
      toolName: 'propose_write_file',
      input: { content: 'line1\nline2' },
    }
    const diff = extractDiff(block)
    expect(diff).toBe('+ line1\n+ line2')
  })
})

describe('parseDiffStats', () => {
  test('counts additions and deletions', () => {
    const diff = `@@ -1,3 +1,4 @@
 unchanged
-removed line
+added line 1
+added line 2`
    const stats = parseDiffStats(diff)
    expect(stats.linesAdded).toBe(2)
    expect(stats.linesRemoved).toBe(1)
    expect(stats.hunks).toBe(1)
  })

  test('counts multiple hunks', () => {
    const diff = `@@ -1,3 +1,3 @@
-old1
+new1
@@ -10,3 +10,3 @@
-old2
+new2`
    const stats = parseDiffStats(diff)
    expect(stats.hunks).toBe(2)
  })

  test('handles empty diff', () => {
    expect(parseDiffStats(undefined)).toEqual({ linesAdded: 0, linesRemoved: 0, hunks: 0 })
    expect(parseDiffStats('')).toEqual({ linesAdded: 0, linesRemoved: 0, hunks: 0 })
  })

  test('ignores +++ and --- headers', () => {
    const diff = `--- a/file.ts
+++ b/file.ts
@@ -1 +1 @@
-old
+new`
    const stats = parseDiffStats(diff)
    expect(stats.linesAdded).toBe(1)
    expect(stats.linesRemoved).toBe(1)
  })
})

describe('getFileChangeType', () => {
  test('returns A for new file creation', () => {
    const block: ToolContentBlock = {
      type: 'tool',
      toolCallId: 'test-1',
      toolName: 'write_file',
      input: {},
      output: 'message: Created new file',
    }
    expect(getFileChangeType(block)).toBe('A')
  })

  test('returns M for write_file modification', () => {
    const block: ToolContentBlock = {
      type: 'tool',
      toolCallId: 'test-1',
      toolName: 'write_file',
      input: {},
      output: 'message: Updated file',
    }
    expect(getFileChangeType(block)).toBe('M')
  })

  test('returns M for str_replace', () => {
    const block: ToolContentBlock = {
      type: 'tool',
      toolCallId: 'test-1',
      toolName: 'str_replace',
      input: {},
    }
    expect(getFileChangeType(block)).toBe('M')
  })

  test('returns A for propose_write_file new file', () => {
    const block: ToolContentBlock = {
      type: 'tool',
      toolCallId: 'test-1',
      toolName: 'propose_write_file',
      input: {},
      output: 'message: Proposed new file src/new.ts',
    }
    expect(getFileChangeType(block)).toBe('A')
  })

  test('returns M for propose_str_replace', () => {
    const block: ToolContentBlock = {
      type: 'tool',
      toolCallId: 'test-1',
      toolName: 'propose_str_replace',
      input: {},
    }
    expect(getFileChangeType(block)).toBe('M')
  })
})

describe('getFileStatsFromBlocks', () => {
  test('aggregates stats for same file', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'test-1',
        toolName: 'str_replace',
        input: { path: 'file.ts' },
        outputRaw: [{ type: 'json', value: { unifiedDiff: '+line1\n+line2' } }],
      },
      {
        type: 'tool',
        toolCallId: 'test-2',
        toolName: 'str_replace',
        input: { path: 'file.ts' },
        outputRaw: [{ type: 'json', value: { unifiedDiff: '+line3\n-removed' } }],
      },
    ]
    const stats = getFileStatsFromBlocks(blocks)
    expect(stats).toHaveLength(1)
    expect(stats[0].path).toBe('file.ts')
    expect(stats[0].stats.linesAdded).toBe(3)
    expect(stats[0].stats.linesRemoved).toBe(1)
  })

  test('separates different files', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'test-1',
        toolName: 'str_replace',
        input: { path: 'file1.ts' },
        outputRaw: [{ type: 'json', value: { unifiedDiff: '+added' } }],
      },
      {
        type: 'tool',
        toolCallId: 'test-2',
        toolName: 'str_replace',
        input: { path: 'file2.ts' },
        outputRaw: [{ type: 'json', value: { unifiedDiff: '-removed' } }],
      },
    ]
    const stats = getFileStatsFromBlocks(blocks)
    expect(stats).toHaveLength(2)
  })

  test('ignores non-edit tools', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'tool',
        toolCallId: 'test-1',
        toolName: 'read_files',
        input: { paths: ['file.ts'] },
      },
    ]
    const stats = getFileStatsFromBlocks(blocks)
    expect(stats).toHaveLength(0)
  })
})

describe('buildActivityTimeline', () => {
  test('builds timeline from mixed blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'text',
        content: 'Making changes to the file',
      } as TextContentBlock,
      {
        type: 'tool',
        toolCallId: 'test-1',
        toolName: 'str_replace',
        input: { path: 'file.ts' },
        outputRaw: [{ type: 'json', value: { unifiedDiff: '+new line' } }],
      },
      {
        type: 'text',
        content: 'Done with changes',
      } as TextContentBlock,
    ]
    const timeline = buildActivityTimeline(blocks)
    expect(timeline).toHaveLength(3)
    expect(timeline[0].type).toBe('commentary')
    expect(timeline[0].content).toBe('Making changes to the file')
    expect(timeline[1].type).toBe('edit')
    expect(timeline[1].content).toBe('file.ts')
    expect(timeline[1].diff).toBe('+new line')
    expect(timeline[2].type).toBe('commentary')
  })

  test('skips reasoning blocks', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'text',
        content: 'Some reasoning',
        textType: 'reasoning',
      } as TextContentBlock,
      {
        type: 'text',
        content: 'Normal text',
      } as TextContentBlock,
    ]
    const timeline = buildActivityTimeline(blocks)
    expect(timeline).toHaveLength(1)
    expect(timeline[0].content).toBe('Normal text')
  })
})

describe('isImplementorAgent', () => {
  test('identifies implementor agents', () => {
    expect(isImplementorAgent({ agentType: 'editor-implementor', blocks: [] })).toBe(true)
    expect(isImplementorAgent({ agentType: 'editor-implementor-opus', blocks: [] })).toBe(true)
    expect(isImplementorAgent({ agentType: 'editor-implementor-gpt-5', blocks: [] })).toBe(true)
    expect(isImplementorAgent({ agentType: 'editor-implementor2', blocks: [] })).toBe(true)
  })

  test('rejects non-implementor agents', () => {
    expect(isImplementorAgent({ agentType: 'file-picker', blocks: [] })).toBe(false)
    expect(isImplementorAgent({ agentType: 'commander', blocks: [] })).toBe(false)
    expect(isImplementorAgent({ agentType: 'best-of-n-selector', blocks: [] })).toBe(false)
  })
})

describe('getImplementorDisplayName', () => {
  test('returns model names', () => {
    expect(getImplementorDisplayName('editor-implementor')).toBe('Sonnet')
    expect(getImplementorDisplayName('editor-implementor-opus')).toBe('Opus')
    expect(getImplementorDisplayName('editor-implementor-gpt-5')).toBe('GPT-5')
    expect(getImplementorDisplayName('editor-implementor-gemini')).toBe('Gemini')
  })

  test('adds index when provided', () => {
    expect(getImplementorDisplayName('editor-implementor', 0)).toBe('Sonnet #1')
    expect(getImplementorDisplayName('editor-implementor-opus', 2)).toBe('Opus #3')
  })
})

describe('getImplementorIndex', () => {
  test('returns index among same-type siblings', () => {
    const agent1 = { type: 'agent', agentId: 'a1', agentName: 'Impl 1', agentType: 'editor-implementor', content: '', status: 'complete', blocks: [] } as AgentContentBlock
    const agent2 = { type: 'agent', agentId: 'a2', agentName: 'Impl 2', agentType: 'editor-implementor', content: '', status: 'complete', blocks: [] } as AgentContentBlock
    const agent3 = { type: 'agent', agentId: 'a3', agentName: 'Impl 3', agentType: 'editor-implementor-opus', content: '', status: 'complete', blocks: [] } as AgentContentBlock
    const siblings: ContentBlock[] = [agent1, agent2, agent3]

    expect(getImplementorIndex(agent1, siblings)).toBe(0)
    expect(getImplementorIndex(agent2, siblings)).toBe(1)
    expect(getImplementorIndex(agent3, siblings)).toBeUndefined()
  })

  test('returns undefined for non-implementor', () => {
    const filePicker = { type: 'agent', agentId: 'fp1', agentName: 'File Picker', agentType: 'file-picker', content: '', status: 'complete', blocks: [] } as AgentContentBlock
    const siblings: ContentBlock[] = [filePicker]

    expect(getImplementorIndex(filePicker, siblings)).toBeUndefined()
  })
})
