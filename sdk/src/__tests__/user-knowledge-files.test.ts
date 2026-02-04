import { createMockFs } from '@codebuff/common/testing/mocks/filesystem'
import { createMockLogger } from '@codebuff/common/testing/mocks/logger'
import { describe, it, expect } from 'bun:test'

import { loadUserKnowledgeFiles } from '../run-state'

const MOCK_HOME = '/mock/home'

describe('loadUserKnowledgeFiles', () => {
  it('should return empty object when no knowledge files exist', async () => {
    const mockFs = createMockFs({
      readdirImpl: async () => ['.bashrc', '.gitconfig', '.profile'],
      readFileImpl: async () => {
        throw new Error('File not found')
      },
    })
    const mockLogger = createMockLogger()

    const result = await loadUserKnowledgeFiles({
      fs: mockFs,
      logger: mockLogger,
      homeDir: MOCK_HOME,
    })

    expect(Object.keys(result)).toHaveLength(0)
  })

  it('should load ~/.knowledge.md when it exists', async () => {
    const mockFs = createMockFs({
      readdirImpl: async () => ['.knowledge.md', '.bashrc'],
      readFileImpl: async (path: string) => {
        if (path === '/mock/home/.knowledge.md') {
          return '# My user knowledge'
        }
        throw new Error('File not found')
      },
    })
    const mockLogger = createMockLogger()

    const result = await loadUserKnowledgeFiles({
      fs: mockFs,
      logger: mockLogger,
      homeDir: MOCK_HOME,
    })

    expect(result).toEqual({ '~/.knowledge.md': '# My user knowledge' })
  })

  it('should load ~/.AGENTS.md when ~/.knowledge.md does not exist', async () => {
    const mockFs = createMockFs({
      readdirImpl: async () => ['.AGENTS.md', '.bashrc'],
      readFileImpl: async (path: string) => {
        if (path === '/mock/home/.AGENTS.md') {
          return '# Agents config'
        }
        throw new Error('File not found')
      },
    })
    const mockLogger = createMockLogger()

    const result = await loadUserKnowledgeFiles({
      fs: mockFs,
      logger: mockLogger,
      homeDir: MOCK_HOME,
    })

    expect(result).toEqual({ '~/.AGENTS.md': '# Agents config' })
  })

  it('should load ~/.CLAUDE.md when neither knowledge.md nor AGENTS.md exist', async () => {
    const mockFs = createMockFs({
      readdirImpl: async () => ['.CLAUDE.md', '.bashrc'],
      readFileImpl: async (path: string) => {
        if (path === '/mock/home/.CLAUDE.md') {
          return '# Claude instructions'
        }
        throw new Error('File not found')
      },
    })
    const mockLogger = createMockLogger()

    const result = await loadUserKnowledgeFiles({
      fs: mockFs,
      logger: mockLogger,
      homeDir: MOCK_HOME,
    })

    expect(result).toEqual({ '~/.CLAUDE.md': '# Claude instructions' })
  })

  it('should prefer knowledge.md over AGENTS.md when both exist', async () => {
    const mockFs = createMockFs({
      readdirImpl: async () => ['.AGENTS.md', '.knowledge.md', '.bashrc'],
      readFileImpl: async (path: string) => {
        if (path === '/mock/home/.knowledge.md') {
          return '# Knowledge content'
        }
        if (path === '/mock/home/.AGENTS.md') {
          return '# Agents content'
        }
        throw new Error('File not found')
      },
    })
    const mockLogger = createMockLogger()

    const result = await loadUserKnowledgeFiles({
      fs: mockFs,
      logger: mockLogger,
      homeDir: MOCK_HOME,
    })

    expect(result).toEqual({ '~/.knowledge.md': '# Knowledge content' })
  })

  it('should prefer AGENTS.md over CLAUDE.md when both exist', async () => {
    const mockFs = createMockFs({
      readdirImpl: async () => ['.CLAUDE.md', '.AGENTS.md'],
      readFileImpl: async (path: string) => {
        if (path === '/mock/home/.AGENTS.md') {
          return '# Agents content'
        }
        if (path === '/mock/home/.CLAUDE.md') {
          return '# Claude content'
        }
        throw new Error('File not found')
      },
    })
    const mockLogger = createMockLogger()

    const result = await loadUserKnowledgeFiles({
      fs: mockFs,
      logger: mockLogger,
      homeDir: MOCK_HOME,
    })

    expect(result).toEqual({ '~/.AGENTS.md': '# Agents content' })
  })

  it('should only return one knowledge file (highest priority)', async () => {
    const mockFs = createMockFs({
      readdirImpl: async () => [
        '.knowledge.md',
        '.AGENTS.md',
        '.CLAUDE.md',
        '.bashrc',
      ],
      readFileImpl: async (path: string) => {
        if (path === '/mock/home/.knowledge.md') {
          return '# Knowledge'
        }
        if (path === '/mock/home/.AGENTS.md') {
          return '# Agents'
        }
        if (path === '/mock/home/.CLAUDE.md') {
          return '# Claude'
        }
        throw new Error('File not found')
      },
    })
    const mockLogger = createMockLogger()

    const result = await loadUserKnowledgeFiles({
      fs: mockFs,
      logger: mockLogger,
      homeDir: MOCK_HOME,
    })

    expect(Object.keys(result)).toHaveLength(1)
    expect(result['~/.knowledge.md']).toBe('# Knowledge')
  })

  describe('case-insensitive matching', () => {
    it('should find ~/.KNOWLEDGE.md (uppercase) case-insensitively', async () => {
      const mockFs = createMockFs({
        readdirImpl: async () => ['.KNOWLEDGE.md', '.bashrc', '.gitconfig'],
        readFileImpl: async (path: string) => {
          if (path === '/mock/home/.KNOWLEDGE.md') {
            return '# User knowledge (uppercase)'
          }
          throw new Error('File not found')
        },
      })
      const mockLogger = createMockLogger()

      const result = await loadUserKnowledgeFiles({
        fs: mockFs,
        logger: mockLogger,
        homeDir: MOCK_HOME,
      })

      expect(Object.keys(result)).toHaveLength(1)
      expect(result['~/.KNOWLEDGE.md']).toBe('# User knowledge (uppercase)')
    })

    it('should find ~/.agents.md (lowercase) case-insensitively', async () => {
      const mockFs = createMockFs({
        readdirImpl: async () => ['.agents.md', '.bashrc'],
        readFileImpl: async (path: string) => {
          if (path === '/mock/home/.agents.md') {
            return '# Agents file (lowercase)'
          }
          throw new Error('File not found')
        },
      })
      const mockLogger = createMockLogger()

      const result = await loadUserKnowledgeFiles({
        fs: mockFs,
        logger: mockLogger,
        homeDir: MOCK_HOME,
      })

      expect(Object.keys(result)).toHaveLength(1)
      expect(result['~/.agents.md']).toBe('# Agents file (lowercase)')
    })

    it('should find ~/.claude.md (lowercase) case-insensitively', async () => {
      const mockFs = createMockFs({
        readdirImpl: async () => ['.claude.md', '.bashrc'],
        readFileImpl: async (path: string) => {
          if (path === '/mock/home/.claude.md') {
            return '# Claude (lowercase)'
          }
          throw new Error('File not found')
        },
      })
      const mockLogger = createMockLogger()

      const result = await loadUserKnowledgeFiles({
        fs: mockFs,
        logger: mockLogger,
        homeDir: MOCK_HOME,
      })

      expect(Object.keys(result)).toHaveLength(1)
      expect(result['~/.claude.md']).toBe('# Claude (lowercase)')
    })

    it('should find ~/.Knowledge.md (mixed case) case-insensitively', async () => {
      const mockFs = createMockFs({
        readdirImpl: async () => ['.Knowledge.md', '.bashrc'],
        readFileImpl: async (path: string) => {
          if (path === '/mock/home/.Knowledge.md') {
            return '# Mixed case'
          }
          throw new Error('File not found')
        },
      })
      const mockLogger = createMockLogger()

      const result = await loadUserKnowledgeFiles({
        fs: mockFs,
        logger: mockLogger,
        homeDir: MOCK_HOME,
      })

      expect(Object.keys(result)).toHaveLength(1)
      expect(result['~/.Knowledge.md']).toBe('# Mixed case')
    })

    it('should prioritize knowledge.md over AGENTS.md regardless of case', async () => {
      const mockFs = createMockFs({
        readdirImpl: async () => ['.AGENTS.md', '.Knowledge.md', '.bashrc'],
        readFileImpl: async (path: string) => {
          if (path === '/mock/home/.Knowledge.md') {
            return '# Knowledge content'
          }
          if (path === '/mock/home/.AGENTS.md') {
            return '# Agents content'
          }
          throw new Error('File not found')
        },
      })
      const mockLogger = createMockLogger()

      const result = await loadUserKnowledgeFiles({
        fs: mockFs,
        logger: mockLogger,
        homeDir: MOCK_HOME,
      })

      expect(Object.keys(result)).toHaveLength(1)
      expect(result['~/.Knowledge.md']).toBe('# Knowledge content')
    })

    it('should preserve the original filename case in the key', async () => {
      const mockFs = createMockFs({
        readdirImpl: async () => ['.KNOWLEDGE.MD', '.bashrc'],
        readFileImpl: async (path: string) => {
          if (path === '/mock/home/.KNOWLEDGE.MD') {
            return '# All caps'
          }
          throw new Error('File not found')
        },
      })
      const mockLogger = createMockLogger()

      const result = await loadUserKnowledgeFiles({
        fs: mockFs,
        logger: mockLogger,
        homeDir: MOCK_HOME,
      })

      // The key should preserve the original case
      expect(Object.keys(result)[0]).toBe('~/.KNOWLEDGE.MD')
    })
  })

  describe('error handling', () => {
    it('should handle readdir failure gracefully', async () => {
      const mockFs = createMockFs({
        readdirImpl: async () => {
          throw new Error('Permission denied')
        },
        readFileImpl: async () => '',
      })
      const mockLogger = createMockLogger()

      const result = await loadUserKnowledgeFiles({
        fs: mockFs,
        logger: mockLogger,
        homeDir: MOCK_HOME,
      })

      expect(Object.keys(result)).toHaveLength(0)
    })

    it('should handle readFile failure gracefully and try next priority', async () => {
      const mockFs = createMockFs({
        readdirImpl: async () => ['.knowledge.md', '.AGENTS.md'],
        readFileImpl: async (path: string) => {
          if (path === '/mock/home/.knowledge.md') {
            throw new Error('Read error')
          }
          if (path === '/mock/home/.AGENTS.md') {
            return '# Agents fallback'
          }
          throw new Error('File not found')
        },
      })
      const mockLogger = createMockLogger()

      const result = await loadUserKnowledgeFiles({
        fs: mockFs,
        logger: mockLogger,
        homeDir: MOCK_HOME,
      })

      // Should fall back to AGENTS.md when knowledge.md fails to read
      expect(result).toEqual({ '~/.AGENTS.md': '# Agents fallback' })
    })
  })
})
