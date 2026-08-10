import { createMockFs } from '@codebuff/common/testing/mocks/filesystem'
import { createMockLogger } from '@codebuff/common/testing/mocks/logger'
import { describe, it, expect } from 'bun:test'

import { loadUserKnowledgeFiles } from '../run-state'

const MOCK_HOME = '/mock/home'

const load = (
  entries: string[],
  files: Record<string, string>,
): Promise<Record<string, string>> =>
  loadUserKnowledgeFiles({
    fs: createMockFs({
      readdirImpl: async () => entries,
      readFileImpl: async (path: string) => {
        const content = files[path]
        if (content === undefined) throw new Error('File not found')
        return content
      },
    }),
    logger: createMockLogger(),
    homeDir: MOCK_HOME,
  })

describe('loadUserKnowledgeFiles', () => {
  it('should return empty object when no knowledge files exist', async () => {
    const result = await load(['.bashrc', '.gitconfig', '.profile'], {})
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('should load ~/.AGENTS.md when it exists', async () => {
    const result = await load(['.AGENTS.md', '.bashrc'], {
      '/mock/home/.AGENTS.md': '# Agents config',
    })
    expect(result).toEqual({ '~/.AGENTS.md': '# Agents config' })
  })

  it('should load ~/.CLAUDE.md when ~/.AGENTS.md does not exist', async () => {
    const result = await load(['.CLAUDE.md', '.bashrc'], {
      '/mock/home/.CLAUDE.md': '# Claude instructions',
    })
    expect(result).toEqual({ '~/.CLAUDE.md': '# Claude instructions' })
  })

  it('should prefer AGENTS.md over CLAUDE.md when both exist', async () => {
    const result = await load(['.CLAUDE.md', '.AGENTS.md'], {
      '/mock/home/.AGENTS.md': '# Agents content',
      '/mock/home/.CLAUDE.md': '# Claude content',
    })
    expect(result).toEqual({ '~/.AGENTS.md': '# Agents content' })
  })

  it('should ignore ~/.knowledge.md now that it left the priority list', async () => {
    const result = await load(['.knowledge.md', '.CLAUDE.md'], {
      '/mock/home/.knowledge.md': '# Legacy knowledge',
      '/mock/home/.CLAUDE.md': '# Claude content',
    })
    expect(result).toEqual({ '~/.CLAUDE.md': '# Claude content' })
  })

  it('should only return one knowledge file (highest priority)', async () => {
    const result = await load(['.AGENTS.md', '.CLAUDE.md', '.bashrc'], {
      '/mock/home/.AGENTS.md': '# Agents',
      '/mock/home/.CLAUDE.md': '# Claude',
    })
    expect(Object.keys(result)).toHaveLength(1)
    expect(result['~/.AGENTS.md']).toBe('# Agents')
  })

  describe('case-insensitive matching', () => {
    it('should find ~/.agents.md (lowercase)', async () => {
      const result = await load(['.agents.md', '.bashrc'], {
        '/mock/home/.agents.md': '# Agents file (lowercase)',
      })
      expect(result).toEqual({ '~/.agents.md': '# Agents file (lowercase)' })
    })

    it('should find ~/.claude.md (lowercase)', async () => {
      const result = await load(['.claude.md', '.bashrc'], {
        '/mock/home/.claude.md': '# Claude (lowercase)',
      })
      expect(result).toEqual({ '~/.claude.md': '# Claude (lowercase)' })
    })

    it('should prioritize AGENTS.md over CLAUDE.md regardless of case', async () => {
      const result = await load(['.CLAUDE.md', '.Agents.md'], {
        '/mock/home/.Agents.md': '# Agents content',
        '/mock/home/.CLAUDE.md': '# Claude content',
      })
      expect(result).toEqual({ '~/.Agents.md': '# Agents content' })
    })

    it('should preserve the original filename case in the key', async () => {
      const result = await load(['.AGENTS.MD', '.bashrc'], {
        '/mock/home/.AGENTS.MD': '# All caps',
      })
      expect(Object.keys(result)[0]).toBe('~/.AGENTS.MD')
    })
  })

  describe('error handling', () => {
    it('should handle readdir failure gracefully', async () => {
      const result = await loadUserKnowledgeFiles({
        fs: createMockFs({
          readdirImpl: async () => {
            throw new Error('Permission denied')
          },
          readFileImpl: async () => '',
        }),
        logger: createMockLogger(),
        homeDir: MOCK_HOME,
      })
      expect(Object.keys(result)).toHaveLength(0)
    })

    it('should handle readFile failure gracefully and try next priority', async () => {
      const result = await load(['.AGENTS.md', '.CLAUDE.md'], {
        '/mock/home/.CLAUDE.md': '# Claude fallback',
      })
      expect(result).toEqual({ '~/.CLAUDE.md': '# Claude fallback' })
    })
  })
})
