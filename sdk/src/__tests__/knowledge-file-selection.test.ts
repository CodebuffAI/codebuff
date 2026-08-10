import { describe, expect, test } from 'bun:test'

import {
  KNOWLEDGE_FILE_NAMES,
  isKnowledgeFile,
  selectHighestPriorityKnowledgeFile,
  selectKnowledgeFilePaths,
} from '../run-state'

describe('KNOWLEDGE_FILE_NAMES', () => {
  test('contains expected file names in priority order', () => {
    expect(KNOWLEDGE_FILE_NAMES).toEqual(['AGENTS.md', 'CLAUDE.md'])
  })
})

describe('isKnowledgeFile', () => {
  test('returns true for AGENTS.md', () => {
    expect(isKnowledgeFile('AGENTS.md')).toBe(true)
    expect(isKnowledgeFile('src/agents.md')).toBe(true)
    expect(isKnowledgeFile('Agents.MD')).toBe(true)
  })

  test('returns true for CLAUDE.md', () => {
    expect(isKnowledgeFile('CLAUDE.md')).toBe(true)
    expect(isKnowledgeFile('src/claude.md')).toBe(true)
    expect(isKnowledgeFile('Claude.MD')).toBe(true)
  })

  test('returns true for *.knowledge.md pattern', () => {
    expect(isKnowledgeFile('authentication.knowledge.md')).toBe(true)
    expect(isKnowledgeFile('src/api.knowledge.md')).toBe(true)
    expect(isKnowledgeFile('docs/AUTH.KNOWLEDGE.MD')).toBe(true)
    expect(isKnowledgeFile('foo.bar.knowledge.md')).toBe(true)
  })

  test('returns false for bare knowledge.md now that it left the priority list', () => {
    expect(isKnowledgeFile('knowledge.md')).toBe(false)
    expect(isKnowledgeFile('src/knowledge.md')).toBe(false)
  })

  test('returns false for non-knowledge files', () => {
    expect(isKnowledgeFile('README.md')).toBe(false)
    expect(isKnowledgeFile('src/utils.ts')).toBe(false)
    expect(isKnowledgeFile('agents.txt')).toBe(false)
    expect(isKnowledgeFile('myagents.md')).toBe(false)
    expect(isKnowledgeFile('auth.agents.md')).toBe(false)
    expect(isKnowledgeFile('auth.claude.md')).toBe(false)
  })
})

describe('selectHighestPriorityKnowledgeFile', () => {
  test('returns undefined for empty array', () => {
    expect(selectHighestPriorityKnowledgeFile([])).toBeUndefined()
  })

  test('returns undefined when no knowledge files present', () => {
    expect(
      selectHighestPriorityKnowledgeFile(['README.md', 'src/utils.ts']),
    ).toBeUndefined()
  })

  test('returns the only knowledge file', () => {
    expect(selectHighestPriorityKnowledgeFile(['CLAUDE.md'])).toBe('CLAUDE.md')
  })

  test('prefers AGENTS.md over CLAUDE.md', () => {
    expect(selectHighestPriorityKnowledgeFile(['CLAUDE.md', 'AGENTS.md'])).toBe(
      'AGENTS.md',
    )
  })

  test('handles case-insensitive matching', () => {
    expect(selectHighestPriorityKnowledgeFile(['agents.md'])).toBe('agents.md')
    expect(selectHighestPriorityKnowledgeFile(['Claude.md'])).toBe('Claude.md')
  })

  test('filters out non-knowledge files before selecting', () => {
    expect(
      selectHighestPriorityKnowledgeFile([
        'README.md',
        'AGENTS.md',
        'utils.ts',
      ]),
    ).toBe('AGENTS.md')
  })
})

describe('selectKnowledgeFilePaths', () => {
  test('selects AGENTS.md when it exists alone', () => {
    expect(selectKnowledgeFilePaths(['src/AGENTS.md', 'lib/utils.ts'])).toEqual(
      ['src/AGENTS.md'],
    )
  })

  test('selects CLAUDE.md when AGENTS.md does not exist', () => {
    expect(selectKnowledgeFilePaths(['src/CLAUDE.md', 'lib/utils.ts'])).toEqual(
      ['src/CLAUDE.md'],
    )
  })

  test('prefers AGENTS.md over CLAUDE.md when both exist in same directory', () => {
    expect(
      selectKnowledgeFilePaths(['src/AGENTS.md', 'src/CLAUDE.md', 'lib/utils.ts']),
    ).toEqual(['src/AGENTS.md'])
  })

  test('handles case-insensitive matching', () => {
    const result = selectKnowledgeFilePaths([
      'src/agents.md',
      'lib/Agents.MD',
      'root/CLAUDE.md',
    ])
    expect(result).toHaveLength(3)
    expect(result).toContain('src/agents.md')
    expect(result).toContain('lib/Agents.MD')
    expect(result).toContain('root/CLAUDE.md')
  })

  test('selects one knowledge file per directory when multiple directories have files', () => {
    const result = selectKnowledgeFilePaths([
      'src/AGENTS.md',
      'src/CLAUDE.md',
      'lib/CLAUDE.md',
      'docs/AGENTS.md',
    ])
    expect(result).toHaveLength(3)
    expect(result).toContain('src/AGENTS.md')
    expect(result).toContain('lib/CLAUDE.md')
    expect(result).toContain('docs/AGENTS.md')
  })

  test('handles nested directory structures', () => {
    const result = selectKnowledgeFilePaths([
      'a/b/c/d/AGENTS.md',
      'a/b/c/d/CLAUDE.md',
      'a/b/c/CLAUDE.md',
      'a/b/AGENTS.md',
    ])
    expect(result).toHaveLength(3)
    expect(result).toContain('a/b/c/d/AGENTS.md')
    expect(result).toContain('a/b/c/CLAUDE.md')
    expect(result).toContain('a/b/AGENTS.md')
  })

  test('returns empty array when no knowledge files exist', () => {
    expect(
      selectKnowledgeFilePaths(['src/utils.ts', 'lib/helper.js', 'README.md']),
    ).toEqual([])
  })

  test('ignores bare knowledge.md files', () => {
    expect(
      selectKnowledgeFilePaths(['src/knowledge.md', 'src/CLAUDE.md']),
    ).toEqual(['src/CLAUDE.md'])
  })

  test('handles root directory knowledge files', () => {
    expect(selectKnowledgeFilePaths(['AGENTS.md', 'CLAUDE.md'])).toEqual([
      'AGENTS.md',
    ])
  })

  test('handles files with similar names but different extensions', () => {
    expect(
      selectKnowledgeFilePaths(['src/AGENTS.md', 'src/agents.txt']),
    ).toEqual(['src/AGENTS.md'])
  })

  test('handles empty file list', () => {
    expect(selectKnowledgeFilePaths([])).toEqual([])
  })

  test('prioritizes correctly with all variations in same directory', () => {
    const result = selectKnowledgeFilePaths([
      'dir/AGENTS.md',
      'dir/agents.MD',
      'dir/CLAUDE.md',
      'dir/claude.MD',
    ])
    expect(result).toHaveLength(1)
    expect(result[0].toLowerCase()).toBe('dir/agents.md')
  })
})
