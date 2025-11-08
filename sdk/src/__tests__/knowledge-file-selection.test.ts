import { describe, expect, test } from 'bun:test'

import { selectKnowledgeFilePaths } from '../run-state'

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
