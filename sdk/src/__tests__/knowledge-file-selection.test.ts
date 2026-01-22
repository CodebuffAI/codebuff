import { describe, expect, test } from 'bun:test'

import {
  KNOWLEDGE_FILE_NAMES,
  isKnowledgeFile,
  selectHighestPriorityKnowledgeFile,
  selectKnowledgeFilePaths,
} from '../run-state'

describe('KNOWLEDGE_FILE_NAMES', () => {
  test('contains expected file names in priority order', () => {
    expect(KNOWLEDGE_FILE_NAMES).toEqual([
      'knowledge.md',
      'AGENTS.md',
      'CLAUDE.md',
    ])
  })
})

describe('isKnowledgeFile', () => {
  test('returns true for knowledge.md', () => {
    expect(isKnowledgeFile('knowledge.md')).toBe(true)
    expect(isKnowledgeFile('src/knowledge.md')).toBe(true)
    expect(isKnowledgeFile('KNOWLEDGE.MD')).toBe(true)
  })

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

  test('returns false for non-knowledge files', () => {
    expect(isKnowledgeFile('README.md')).toBe(false)
    expect(isKnowledgeFile('src/utils.ts')).toBe(false)
    expect(isKnowledgeFile('knowledge.txt')).toBe(false)
    expect(isKnowledgeFile('agents.txt')).toBe(false)
  })

  test('returns false for files with knowledge in name but no dot separator', () => {
    // These should NOT match - stricter matching requires exact filename or .knowledge.md suffix
    expect(isKnowledgeFile('myknowledge.md')).toBe(false)
    expect(isKnowledgeFile('src/authknowledge.md')).toBe(false)
    expect(isKnowledgeFile('preknowledge.md')).toBe(false)
  })

  test('returns false for similar but non-matching patterns', () => {
    // .agents.md and .claude.md patterns should NOT match
    expect(isKnowledgeFile('auth.agents.md')).toBe(false)
    expect(isKnowledgeFile('auth.claude.md')).toBe(false)
    expect(isKnowledgeFile('foo.AGENTS.md')).toBe(false)
    expect(isKnowledgeFile('foo.CLAUDE.md')).toBe(false)
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
    expect(selectHighestPriorityKnowledgeFile(['AGENTS.md'])).toBe('AGENTS.md')
  })

  test('prefers knowledge.md over AGENTS.md', () => {
    expect(
      selectHighestPriorityKnowledgeFile(['AGENTS.md', 'knowledge.md']),
    ).toBe('knowledge.md')
  })

  test('prefers knowledge.md over CLAUDE.md', () => {
    expect(
      selectHighestPriorityKnowledgeFile(['CLAUDE.md', 'knowledge.md']),
    ).toBe('knowledge.md')
  })

  test('prefers AGENTS.md over CLAUDE.md', () => {
    expect(selectHighestPriorityKnowledgeFile(['CLAUDE.md', 'AGENTS.md'])).toBe(
      'AGENTS.md',
    )
  })

  test('prefers knowledge.md when all three exist', () => {
    expect(
      selectHighestPriorityKnowledgeFile([
        'CLAUDE.md',
        'AGENTS.md',
        'knowledge.md',
      ]),
    ).toBe('knowledge.md')
  })

  test('handles case-insensitive matching', () => {
    expect(selectHighestPriorityKnowledgeFile(['KNOWLEDGE.MD'])).toBe(
      'KNOWLEDGE.MD',
    )
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
  test('selects knowledge.md when it exists alone', () => {
    const files = ['src/knowledge.md', 'lib/utils.ts']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toEqual(['src/knowledge.md'])
  })

  test('selects AGENTS.md when knowledge.md does not exist', () => {
    const files = ['src/AGENTS.md', 'lib/utils.ts']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toEqual(['src/AGENTS.md'])
  })

  test('selects CLAUDE.md when neither knowledge.md nor AGENTS.md exist', () => {
    const files = ['src/CLAUDE.md', 'lib/utils.ts']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toEqual(['src/CLAUDE.md'])
  })

  test('prefers knowledge.md over AGENTS.md when both exist in same directory', () => {
    const files = ['src/knowledge.md', 'src/AGENTS.md', 'lib/utils.ts']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toEqual(['src/knowledge.md'])
  })

  test('prefers knowledge.md over CLAUDE.md when both exist in same directory', () => {
    const files = ['src/knowledge.md', 'src/CLAUDE.md', 'lib/utils.ts']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toEqual(['src/knowledge.md'])
  })

  test('prefers AGENTS.md over CLAUDE.md when both exist in same directory', () => {
    const files = ['src/AGENTS.md', 'src/CLAUDE.md', 'lib/utils.ts']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toEqual(['src/AGENTS.md'])
  })

  test('prefers knowledge.md when all three exist in same directory', () => {
    const files = [
      'src/knowledge.md',
      'src/AGENTS.md',
      'src/CLAUDE.md',
      'lib/utils.ts',
    ]
    const result = selectKnowledgeFilePaths(files)

    expect(result).toEqual(['src/knowledge.md'])
  })

  test('handles case-insensitive matching for knowledge.md', () => {
    const files = ['src/Knowledge.md', 'lib/KNOWLEDGE.MD', 'root/knowledge.MD']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(3)
    expect(result).toContain('src/Knowledge.md')
    expect(result).toContain('lib/KNOWLEDGE.MD')
    expect(result).toContain('root/knowledge.MD')
  })

  test('handles case-insensitive matching for AGENTS.md', () => {
    const files = ['src/agents.md', 'lib/Agents.MD', 'root/AGENTS.md']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(3)
    expect(result).toContain('src/agents.md')
    expect(result).toContain('lib/Agents.MD')
    expect(result).toContain('root/AGENTS.md')
  })

  test('handles case-insensitive matching for CLAUDE.md', () => {
    const files = ['src/claude.md', 'lib/Claude.MD', 'root/CLAUDE.md']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(3)
    expect(result).toContain('src/claude.md')
    expect(result).toContain('lib/Claude.MD')
    expect(result).toContain('root/CLAUDE.md')
  })

  test('selects one knowledge file per directory when multiple directories have files', () => {
    const files = [
      'src/knowledge.md',
      'src/AGENTS.md',
      'lib/AGENTS.md',
      'lib/CLAUDE.md',
      'docs/CLAUDE.md',
    ]
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(3)
    expect(result).toContain('src/knowledge.md')
    expect(result).toContain('lib/AGENTS.md')
    expect(result).toContain('docs/CLAUDE.md')
  })

  test('handles nested directory structures', () => {
    const files = [
      'src/components/knowledge.md',
      'src/components/AGENTS.md',
      'src/utils/AGENTS.md',
      'src/utils/CLAUDE.md',
    ]
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(2)
    expect(result).toContain('src/components/knowledge.md')
    expect(result).toContain('src/utils/AGENTS.md')
  })

  test('returns empty array when no knowledge files exist', () => {
    const files = ['src/utils.ts', 'lib/helper.js', 'README.md']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toEqual([])
  })

  test('handles root directory knowledge files', () => {
    const files = ['knowledge.md', 'AGENTS.md', 'CLAUDE.md']
    const result = selectKnowledgeFilePaths(files)

    expect(result).toEqual(['knowledge.md'])
  })

  test('handles deeply nested directory structures', () => {
    const files = [
      'a/b/c/d/knowledge.md',
      'a/b/c/d/AGENTS.md',
      'a/b/c/CLAUDE.md',
      'a/b/AGENTS.md',
    ]
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(3)
    expect(result).toContain('a/b/c/d/knowledge.md')
    expect(result).toContain('a/b/c/CLAUDE.md')
    expect(result).toContain('a/b/AGENTS.md')
  })

  test('handles files with similar names but different extensions', () => {
    const files = [
      'src/knowledge.md',
      'src/knowledge.txt',
      'src/AGENTS.md',
      'src/agents.txt',
    ]
    const result = selectKnowledgeFilePaths(files)

    expect(result).toEqual(['src/knowledge.md'])
  })

  test('handles empty file list', () => {
    const files: string[] = []
    const result = selectKnowledgeFilePaths(files)

    expect(result).toEqual([])
  })

  test('handles file paths with special characters', () => {
    const files = [
      'my-project/knowledge.md',
      'my_project/AGENTS.md',
      'my.project/CLAUDE.md',
    ]
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(3)
    expect(result).toContain('my-project/knowledge.md')
    expect(result).toContain('my_project/AGENTS.md')
    expect(result).toContain('my.project/CLAUDE.md')
  })

  test('prioritizes correctly with all variations in same directory', () => {
    const files = [
      'dir/knowledge.md',
      'dir/Knowledge.MD',
      'dir/AGENTS.md',
      'dir/agents.MD',
      'dir/CLAUDE.md',
      'dir/claude.MD',
    ]
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(1)
    expect(result[0].toLowerCase()).toBe('dir/knowledge.md')
  })

  test('handles paths correctly regardless of separator', () => {
    const files = [
      'src/components/knowledge.md',
      'src/components/AGENTS.md',
      'lib/CLAUDE.md',
    ]
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(2)
    expect(result).toContain('src/components/knowledge.md')
    expect(result).toContain('lib/CLAUDE.md')
  })
})

describe('selectKnowledgeFilePaths - pattern files (*.knowledge.md)', () => {
  test('includes ALL *.knowledge.md pattern files from same directory', () => {
    const files = [
      'src/auth.knowledge.md',
      'src/api.knowledge.md',
      'src/database.knowledge.md',
    ]
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(3)
    expect(result).toContain('src/auth.knowledge.md')
    expect(result).toContain('src/api.knowledge.md')
    expect(result).toContain('src/database.knowledge.md')
  })

  test('includes pattern files even when standard file exists in same directory', () => {
    const files = [
      'src/knowledge.md',
      'src/AGENTS.md',
      'src/auth.knowledge.md',
      'src/api.knowledge.md',
    ]
    const result = selectKnowledgeFilePaths(files)

    // Should have 1 standard file (knowledge.md wins by priority) + 2 pattern files
    expect(result).toHaveLength(3)
    expect(result).toContain('src/knowledge.md')
    expect(result).not.toContain('src/AGENTS.md') // Lower priority, same dir
    expect(result).toContain('src/auth.knowledge.md')
    expect(result).toContain('src/api.knowledge.md')
  })

  test('includes pattern files alone in a directory', () => {
    const files = [
      'src/auth.knowledge.md',
      'lib/api.knowledge.md',
    ]
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(2)
    expect(result).toContain('src/auth.knowledge.md')
    expect(result).toContain('lib/api.knowledge.md')
  })

  test('includes pattern files from multiple directories', () => {
    const files = [
      'src/auth.knowledge.md',
      'src/api.knowledge.md',
      'lib/database.knowledge.md',
      'docs/deployment.knowledge.md',
    ]
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(4)
    expect(result).toContain('src/auth.knowledge.md')
    expect(result).toContain('src/api.knowledge.md')
    expect(result).toContain('lib/database.knowledge.md')
    expect(result).toContain('docs/deployment.knowledge.md')
  })

  test('handles mixed standard and pattern files across multiple directories', () => {
    const files = [
      'src/knowledge.md',
      'src/auth.knowledge.md',
      'lib/AGENTS.md',
      'lib/api.knowledge.md',
      'docs/CLAUDE.md',
      'docs/deployment.knowledge.md',
      'docs/testing.knowledge.md',
    ]
    const result = selectKnowledgeFilePaths(files)

    // 3 standard files (one per directory) + 4 pattern files
    expect(result).toHaveLength(7)
    // Standard files (one per directory)
    expect(result).toContain('src/knowledge.md')
    expect(result).toContain('lib/AGENTS.md')
    expect(result).toContain('docs/CLAUDE.md')
    // ALL pattern files
    expect(result).toContain('src/auth.knowledge.md')
    expect(result).toContain('lib/api.knowledge.md')
    expect(result).toContain('docs/deployment.knowledge.md')
    expect(result).toContain('docs/testing.knowledge.md')
  })

  test('orders standard files before pattern files in result', () => {
    const files = [
      'src/auth.knowledge.md',
      'src/knowledge.md',
      'lib/api.knowledge.md',
    ]
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(3)
    // Standard file should come first
    expect(result[0]).toBe('src/knowledge.md')
    // Pattern files follow
    expect(result.slice(1)).toContain('src/auth.knowledge.md')
    expect(result.slice(1)).toContain('lib/api.knowledge.md')
  })

  test('handles case-insensitive matching for pattern files', () => {
    const files = [
      'src/AUTH.KNOWLEDGE.MD',
      'lib/Api.Knowledge.md',
      'docs/database.knowledge.md',
    ]
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(3)
    expect(result).toContain('src/AUTH.KNOWLEDGE.MD')
    expect(result).toContain('lib/Api.Knowledge.md')
    expect(result).toContain('docs/database.knowledge.md')
  })

  test('does not match files with knowledge in name but wrong pattern', () => {
    const files = [
      'src/myknowledge.md', // Should NOT match - no dot separator
      'src/knowledge-file.md', // Should NOT match - not exact match
      'src/auth.knowledge.md', // Should match
    ]
    const result = selectKnowledgeFilePaths(files)

    expect(result).toHaveLength(1)
    expect(result).toContain('src/auth.knowledge.md')
  })
})
