import { describe, it, expect, mock } from 'bun:test'

import { loadUserKnowledgeFile } from '../run-state'

const MOCK_HOME = '/mock/home'

describe('loadUserKnowledgeFile', () => {
  it('should return empty object when no knowledge files exist', async () => {
    const mockFs = {
      readdir: mock(async () => ['.bashrc', '.gitconfig', '.profile']),
      readFile: mock(async () => {
        throw new Error('File not found')
      }),
    }
    const mockLogger = { debug: mock(() => {}) }

    const result = await loadUserKnowledgeFile({
      fs: mockFs as any,
      logger: mockLogger as any,
      homeDir: MOCK_HOME,
    })

    expect(Object.keys(result)).toHaveLength(0)
  })

  it('should load ~/.knowledge.md when it exists', async () => {
    const mockFs = {
      readdir: mock(async () => ['.knowledge.md', '.bashrc']),
      readFile: mock(async (path: string) => {
        if (path === '/mock/home/.knowledge.md') {
          return '# My user knowledge'
        }
        throw new Error('File not found')
      }),
    }
    const mockLogger = { debug: mock(() => {}) }

    const result = await loadUserKnowledgeFile({
      fs: mockFs as any,
      logger: mockLogger as any,
      homeDir: MOCK_HOME,
    })

    expect(result).toEqual({ '~/.knowledge.md': '# My user knowledge' })
  })

  it('should load ~/.AGENTS.md when ~/.knowledge.md does not exist', async () => {
    const mockFs = {
      readdir: mock(async () => ['.AGENTS.md', '.bashrc']),
      readFile: mock(async (path: string) => {
        if (path === '/mock/home/.AGENTS.md') {
          return '# Agents config'
        }
        throw new Error('File not found')
      }),
    }
    const mockLogger = { debug: mock(() => {}) }

    const result = await loadUserKnowledgeFile({
      fs: mockFs as any,
      logger: mockLogger as any,
      homeDir: MOCK_HOME,
    })

    expect(result).toEqual({ '~/.AGENTS.md': '# Agents config' })
  })

  it('should load ~/.CLAUDE.md when neither knowledge.md nor AGENTS.md exist', async () => {
    const mockFs = {
      readdir: mock(async () => ['.CLAUDE.md', '.bashrc']),
      readFile: mock(async (path: string) => {
        if (path === '/mock/home/.CLAUDE.md') {
          return '# Claude instructions'
        }
        throw new Error('File not found')
      }),
    }
    const mockLogger = { debug: mock(() => {}) }

    const result = await loadUserKnowledgeFile({
      fs: mockFs as any,
      logger: mockLogger as any,
      homeDir: MOCK_HOME,
    })

    expect(result).toEqual({ '~/.CLAUDE.md': '# Claude instructions' })
  })

  it('should prefer knowledge.md over AGENTS.md when both exist', async () => {
    const mockFs = {
      readdir: mock(async () => ['.AGENTS.md', '.knowledge.md', '.bashrc']),
      readFile: mock(async (path: string) => {
        if (path === '/mock/home/.knowledge.md') {
          return '# Knowledge content'
        }
        if (path === '/mock/home/.AGENTS.md') {
          return '# Agents content'
        }
        throw new Error('File not found')
      }),
    }
    const mockLogger = { debug: mock(() => {}) }

    const result = await loadUserKnowledgeFile({
      fs: mockFs as any,
      logger: mockLogger as any,
      homeDir: MOCK_HOME,
    })

    expect(result).toEqual({ '~/.knowledge.md': '# Knowledge content' })
  })

  it('should prefer AGENTS.md over CLAUDE.md when both exist', async () => {
    const mockFs = {
      readdir: mock(async () => ['.CLAUDE.md', '.AGENTS.md']),
      readFile: mock(async (path: string) => {
        if (path === '/mock/home/.AGENTS.md') {
          return '# Agents content'
        }
        if (path === '/mock/home/.CLAUDE.md') {
          return '# Claude content'
        }
        throw new Error('File not found')
      }),
    }
    const mockLogger = { debug: mock(() => {}) }

    const result = await loadUserKnowledgeFile({
      fs: mockFs as any,
      logger: mockLogger as any,
      homeDir: MOCK_HOME,
    })

    expect(result).toEqual({ '~/.AGENTS.md': '# Agents content' })
  })

  it('should only return one knowledge file (highest priority)', async () => {
    const mockFs = {
      readdir: mock(async () => [
        '.knowledge.md',
        '.AGENTS.md',
        '.CLAUDE.md',
        '.bashrc',
      ]),
      readFile: mock(async (path: string) => {
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
      }),
    }
    const mockLogger = { debug: mock(() => {}) }

    const result = await loadUserKnowledgeFile({
      fs: mockFs as any,
      logger: mockLogger as any,
      homeDir: MOCK_HOME,
    })

    expect(Object.keys(result)).toHaveLength(1)
    expect(result['~/.knowledge.md']).toBe('# Knowledge')
  })

  describe('case-insensitive matching', () => {
    it('should find ~/.KNOWLEDGE.md (uppercase) case-insensitively', async () => {
      const mockFs = {
        readdir: mock(async () => ['.KNOWLEDGE.md', '.bashrc', '.gitconfig']),
        readFile: mock(async (path: string) => {
          if (path === '/mock/home/.KNOWLEDGE.md') {
            return '# User knowledge (uppercase)'
          }
          throw new Error('File not found')
        }),
      }
      const mockLogger = { debug: mock(() => {}) }

      const result = await loadUserKnowledgeFile({
        fs: mockFs as any,
        logger: mockLogger as any,
        homeDir: MOCK_HOME,
      })

      expect(Object.keys(result)).toHaveLength(1)
      expect(result['~/.KNOWLEDGE.md']).toBe('# User knowledge (uppercase)')
    })

    it('should find ~/.agents.md (lowercase) case-insensitively', async () => {
      const mockFs = {
        readdir: mock(async () => ['.agents.md', '.bashrc']),
        readFile: mock(async (path: string) => {
          if (path === '/mock/home/.agents.md') {
            return '# Agents file (lowercase)'
          }
          throw new Error('File not found')
        }),
      }
      const mockLogger = { debug: mock(() => {}) }

      const result = await loadUserKnowledgeFile({
        fs: mockFs as any,
        logger: mockLogger as any,
        homeDir: MOCK_HOME,
      })

      expect(Object.keys(result)).toHaveLength(1)
      expect(result['~/.agents.md']).toBe('# Agents file (lowercase)')
    })

    it('should find ~/.claude.md (lowercase) case-insensitively', async () => {
      const mockFs = {
        readdir: mock(async () => ['.claude.md', '.bashrc']),
        readFile: mock(async (path: string) => {
          if (path === '/mock/home/.claude.md') {
            return '# Claude (lowercase)'
          }
          throw new Error('File not found')
        }),
      }
      const mockLogger = { debug: mock(() => {}) }

      const result = await loadUserKnowledgeFile({
        fs: mockFs as any,
        logger: mockLogger as any,
        homeDir: MOCK_HOME,
      })

      expect(Object.keys(result)).toHaveLength(1)
      expect(result['~/.claude.md']).toBe('# Claude (lowercase)')
    })

    it('should find ~/.Knowledge.md (mixed case) case-insensitively', async () => {
      const mockFs = {
        readdir: mock(async () => ['.Knowledge.md', '.bashrc']),
        readFile: mock(async (path: string) => {
          if (path === '/mock/home/.Knowledge.md') {
            return '# Mixed case'
          }
          throw new Error('File not found')
        }),
      }
      const mockLogger = { debug: mock(() => {}) }

      const result = await loadUserKnowledgeFile({
        fs: mockFs as any,
        logger: mockLogger as any,
        homeDir: MOCK_HOME,
      })

      expect(Object.keys(result)).toHaveLength(1)
      expect(result['~/.Knowledge.md']).toBe('# Mixed case')
    })

    it('should prioritize knowledge.md over AGENTS.md regardless of case', async () => {
      const mockFs = {
        readdir: mock(async () => ['.AGENTS.md', '.Knowledge.md', '.bashrc']),
        readFile: mock(async (path: string) => {
          if (path === '/mock/home/.Knowledge.md') {
            return '# Knowledge content'
          }
          if (path === '/mock/home/.AGENTS.md') {
            return '# Agents content'
          }
          throw new Error('File not found')
        }),
      }
      const mockLogger = { debug: mock(() => {}) }

      const result = await loadUserKnowledgeFile({
        fs: mockFs as any,
        logger: mockLogger as any,
        homeDir: MOCK_HOME,
      })

      expect(Object.keys(result)).toHaveLength(1)
      expect(result['~/.Knowledge.md']).toBe('# Knowledge content')
    })

    it('should preserve the original filename case in the key', async () => {
      const mockFs = {
        readdir: mock(async () => ['.KNOWLEDGE.MD', '.bashrc']),
        readFile: mock(async (path: string) => {
          if (path === '/mock/home/.KNOWLEDGE.MD') {
            return '# All caps'
          }
          throw new Error('File not found')
        }),
      }
      const mockLogger = { debug: mock(() => {}) }

      const result = await loadUserKnowledgeFile({
        fs: mockFs as any,
        logger: mockLogger as any,
        homeDir: MOCK_HOME,
      })

      // The key should preserve the original case
      expect(Object.keys(result)[0]).toBe('~/.KNOWLEDGE.MD')
    })
  })

  describe('error handling', () => {
    it('should handle readdir failure gracefully', async () => {
      const mockFs = {
        readdir: mock(async () => {
          throw new Error('Permission denied')
        }),
        readFile: mock(async () => ''),
      }
      const mockLogger = { debug: mock(() => {}) }

      const result = await loadUserKnowledgeFile({
        fs: mockFs as any,
        logger: mockLogger as any,
        homeDir: MOCK_HOME,
      })

      expect(Object.keys(result)).toHaveLength(0)
    })

    it('should handle readFile failure gracefully and try next priority', async () => {
      const mockFs = {
        readdir: mock(async () => ['.knowledge.md', '.AGENTS.md']),
        readFile: mock(async (path: string) => {
          if (path === '/mock/home/.knowledge.md') {
            throw new Error('Read error')
          }
          if (path === '/mock/home/.AGENTS.md') {
            return '# Agents fallback'
          }
          throw new Error('File not found')
        }),
      }
      const mockLogger = { debug: mock(() => {}) }

      const result = await loadUserKnowledgeFile({
        fs: mockFs as any,
        logger: mockLogger as any,
        homeDir: MOCK_HOME,
      })

      // Should fall back to AGENTS.md when knowledge.md fails to read
      expect(result).toEqual({ '~/.AGENTS.md': '# Agents fallback' })
    })
  })
})
