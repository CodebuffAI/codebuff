import { describe, expect, it } from 'bun:test'

import {
  consumeCreditsWithDelegation,
  findOrganizationForRepository,
} from '../credit-delegation'
import {
  normalizeRepositoryUrl,
  extractOwnerAndRepo,
} from '../org-billing'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const logger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

describe('Credit Delegation', () => {
  describe('consumeCreditsWithDelegation', () => {
    it('should fail when no repository URL provided', async () => {
      const userId = 'user-123'
      const repositoryUrl = null
      const creditsToConsume = 100

      const result = await consumeCreditsWithDelegation({
        userId,
        repositoryUrl,
        creditsToConsume,
        logger,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('No repository URL provided')
    })

    it('should fail when repository URL is empty string', async () => {
      const result = await consumeCreditsWithDelegation({
        userId: 'user-123',
        repositoryUrl: '',
        creditsToConsume: 100,
        logger,
      })

      // Empty string is truthy in the check, but will fail to find org
      expect(result.success).toBe(false)
    })
  })

  describe('normalizeRepositoryUrl', () => {
    it('should normalize GitHub HTTPS URLs', () => {
      const url = 'https://github.com/owner/repo.git'
      const normalized = normalizeRepositoryUrl(url)
      expect(normalized).toBe('https://github.com/owner/repo')
    })

    it('should normalize GitHub SSH URLs', () => {
      const url = 'git@github.com:owner/repo.git'
      const normalized = normalizeRepositoryUrl(url)
      expect(normalized).toBe('https://github.com/owner/repo')
    })

    it('should handle URLs without .git suffix', () => {
      const url = 'https://github.com/owner/repo'
      const normalized = normalizeRepositoryUrl(url)
      expect(normalized).toBe('https://github.com/owner/repo')
    })

    it('should handle URLs with trailing slashes', () => {
      const url = 'https://github.com/owner/repo/'
      const normalized = normalizeRepositoryUrl(url)
      expect(normalized).toBe('https://github.com/owner/repo')
    })

    it('should convert to lowercase for case-insensitive comparison', () => {
      const url = 'https://GitHub.com/Owner/Repo'
      const normalized = normalizeRepositoryUrl(url)
      expect(normalized).toBe('https://github.com/owner/repo')
    })
  })

  describe('extractOwnerAndRepo', () => {
    it('should extract owner and repo from normalized URL', () => {
      const result = extractOwnerAndRepo('github.com/owner/repo')
      expect(result).toEqual({ owner: 'owner', repo: 'repo' })
    })

    it('should extract from GitLab URLs', () => {
      const result = extractOwnerAndRepo('gitlab.com/myorg/myproject')
      expect(result).toEqual({ owner: 'myorg', repo: 'myproject' })
    })

    it('should extract from Bitbucket URLs', () => {
      const result = extractOwnerAndRepo('bitbucket.org/team/project')
      expect(result).toEqual({ owner: 'team', repo: 'project' })
    })

    it('should return null for invalid URLs', () => {
      const result = extractOwnerAndRepo('invalid-url')
      expect(result).toBeNull()
    })

    it('should return null for URLs with insufficient path segments', () => {
      const result = extractOwnerAndRepo('github.com/owner')
      expect(result).toBeNull()
    })

    it('should handle URLs with extra path segments', () => {
      const result = extractOwnerAndRepo('github.com/owner/repo/tree/main')
      expect(result).toEqual({ owner: 'owner', repo: 'repo' })
    })
  })

  describe('organization lookup and delegation flow', () => {
    // These tests verify the logic flow without hitting the actual database
    // The findOrganizationForRepository function requires database access,
    // so we test the delegation result structure

    it('should return correct structure when delegation fails', async () => {
      const result = await consumeCreditsWithDelegation({
        userId: 'user-123',
        repositoryUrl: 'https://github.com/unknown/repo',
        creditsToConsume: 100,
        logger,
      })

      // Should have the expected failure structure
      expect(result.success).toBe(false)
      expect(result.organizationId).toBeUndefined()
      expect(typeof result.error).toBe('string')
    })

    it('should include error message when no organization found', async () => {
      const result = await consumeCreditsWithDelegation({
        userId: 'user-without-org',
        repositoryUrl: 'https://github.com/some/repo',
        creditsToConsume: 50,
        logger,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('URL edge cases in delegation', () => {
    it('should handle malformed URLs gracefully', async () => {
      const result = await consumeCreditsWithDelegation({
        userId: 'user-123',
        repositoryUrl: 'not-a-valid-url',
        creditsToConsume: 100,
        logger,
      })

      expect(result.success).toBe(false)
    })

    it('should handle URLs from unsupported providers', async () => {
      const result = await consumeCreditsWithDelegation({
        userId: 'user-123',
        repositoryUrl: 'https://unknown-git-host.com/owner/repo',
        creditsToConsume: 100,
        logger,
      })

      expect(result.success).toBe(false)
    })
  })
})
