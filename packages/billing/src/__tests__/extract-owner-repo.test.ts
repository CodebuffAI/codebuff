import { describe, it, expect } from 'bun:test'
import { extractOwnerAndRepo } from '../org-billing'

describe('extractOwnerAndRepo', () => {
  describe('GitHub HTTPS URLs', () => {
    it('should extract owner and repo from standard GitHub HTTPS URL', () => {
      const result = extractOwnerAndRepo('https://github.com/codebuffai/codebuff')
      expect(result).toEqual({ owner: 'codebuffai', repo: 'codebuff' })
    })

    it('should extract owner and repo from GitHub HTTPS URL with .git suffix', () => {
      const result = extractOwnerAndRepo('https://github.com/codebuffai/codebuff.git')
      expect(result).toEqual({ owner: 'codebuffai', repo: 'codebuff' })
    })

    it('should handle mixed case URLs', () => {
      const result = extractOwnerAndRepo('https://github.com/CodebuffAI/Codebuff')
      expect(result).toEqual({ owner: 'codebuffai', repo: 'codebuff' })
    })

    it('should handle URLs with extra path segments', () => {
      const result = extractOwnerAndRepo('https://github.com/codebuffai/codebuff/tree/main')
      expect(result).toEqual({ owner: 'codebuffai', repo: 'codebuff' })
    })

    it('should handle URLs with query parameters', () => {
      const result = extractOwnerAndRepo('https://github.com/codebuffai/codebuff?tab=readme-ov-file')
      expect(result).toEqual({ owner: 'codebuffai', repo: 'codebuff' })
    })
  })

  describe('GitHub SSH URLs', () => {
    it('should extract owner and repo from SSH URL', () => {
      const result = extractOwnerAndRepo('git@github.com:CodebuffAI/codebuff.git')
      expect(result).toEqual({ owner: 'codebuffai', repo: 'codebuff' })
    })

    it('should extract owner and repo from SSH URL without .git suffix', () => {
      const result = extractOwnerAndRepo('git@github.com:codebuffai/codebuff')
      expect(result).toEqual({ owner: 'codebuffai', repo: 'codebuff' })
    })

    it('should handle SSH URLs with mixed case', () => {
      const result = extractOwnerAndRepo('git@github.com:CODEBUFFAI/CODEBUFF.git')
      expect(result).toEqual({ owner: 'codebuffai', repo: 'codebuff' })
    })
  })

  describe('URLs without protocol', () => {
    it('should handle GitHub URLs without protocol', () => {
      const result = extractOwnerAndRepo('github.com/codebuffai/codebuff')
      expect(result).toEqual({ owner: 'codebuffai', repo: 'codebuff' })
    })

    it('should handle GitHub URLs without protocol with .git suffix', () => {
      const result = extractOwnerAndRepo('github.com/codebuffai/codebuff.git')
      expect(result).toEqual({ owner: 'codebuffai', repo: 'codebuff' })
    })
  })

  describe('Other Git hosting providers', () => {
    it('should extract from GitLab URLs', () => {
      const result = extractOwnerAndRepo('https://gitlab.com/myuser/myrepo')
      expect(result).toEqual({ owner: 'myuser', repo: 'myrepo' })
    })

    it('should extract from GitLab SSH URLs', () => {
      const result = extractOwnerAndRepo('git@gitlab.com:myuser/myrepo.git')
      expect(result).toEqual({ owner: 'myuser', repo: 'myrepo' })
    })

    it('should extract from Bitbucket URLs', () => {
      const result = extractOwnerAndRepo('https://bitbucket.org/myuser/myrepo')
      expect(result).toEqual({ owner: 'myuser', repo: 'myrepo' })
    })

    it('should extract from Bitbucket SSH URLs', () => {
      const result = extractOwnerAndRepo('git@bitbucket.org:myuser/myrepo.git')
      expect(result).toEqual({ owner: 'myuser', repo: 'myrepo' })
    })
  })

  describe('Edge cases and error conditions', () => {
    it('should return null for empty string', () => {
      const result = extractOwnerAndRepo('')
      expect(result).toBeNull()
    })

    it('should return null for whitespace-only string', () => {
      const result = extractOwnerAndRepo('   ')
      expect(result).toBeNull()
    })

    it('should return null for invalid URLs', () => {
      const result = extractOwnerAndRepo('not-a-url')
      expect(result).toBeNull()
    })

    it('should return null for URLs with insufficient path segments', () => {
      const result = extractOwnerAndRepo('https://github.com/onlyowner')
      expect(result).toBeNull()
    })

    it('should return null for unknown hosting providers', () => {
      const result = extractOwnerAndRepo('https://example.com/owner/repo')
      expect(result).toBeNull()
    })

    it('should handle URLs with trailing slashes', () => {
      const result = extractOwnerAndRepo('https://github.com/codebuffai/codebuff/')
      expect(result).toEqual({ owner: 'codebuffai', repo: 'codebuff' })
    })

    it('should handle URLs with multiple trailing slashes', () => {
      const result = extractOwnerAndRepo('https://github.com/codebuffai/codebuff///')
      expect(result).toEqual({ owner: 'codebuffai', repo: 'codebuff' })
    })

    it('should handle malformed SSH URLs gracefully', () => {
      const result = extractOwnerAndRepo('git@invalid-format')
      expect(result).toBeNull()
    })

    it('should handle URLs with special characters in owner/repo names', () => {
      const result = extractOwnerAndRepo('https://github.com/my-org/my-repo-name')
      expect(result).toEqual({ owner: 'my-org', repo: 'my-repo-name' })
    })

    it('should handle URLs with numbers in owner/repo names', () => {
      const result = extractOwnerAndRepo('https://github.com/user123/repo456')
      expect(result).toEqual({ owner: 'user123', repo: 'repo456' })
    })

    it('should handle URLs with underscores in owner/repo names', () => {
      const result = extractOwnerAndRepo('https://github.com/my_user/my_repo')
      expect(result).toEqual({ owner: 'my_user', repo: 'my_repo' })
    })
  })

  describe('Real-world examples', () => {
    it('should handle complex GitHub repository URLs', () => {
      const testCases = [
        {
          input: 'https://github.com/facebook/react.git',
          expected: { owner: 'facebook', repo: 'react' }
        },
        {
          input: 'git@github.com:microsoft/TypeScript.git',
          expected: { owner: 'microsoft', repo: 'typescript' }
        },
        {
          input: 'https://github.com/vercel/next.js',
          expected: { owner: 'vercel', repo: 'next.js' }
        },
        {
          input: 'git@github.com:nodejs/node',
          expected: { owner: 'nodejs', repo: 'node' }
        }
      ]

      testCases.forEach(({ input, expected }) => {
        const result = extractOwnerAndRepo(input)
        expect(result).toEqual(expected)
      })
    })
  })
})
