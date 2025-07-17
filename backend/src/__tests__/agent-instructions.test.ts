import { describe, it, expect, beforeEach } from 'bun:test'
import {
  ProjectFileContext,
  getStubProjectFileContext,
} from '@codebuff/common/util/file'
import { getAgentInstructionsPrompt } from '../system-prompt/prompts'

describe('Agent Instructions', () => {
  let mockFileContext: ProjectFileContext

  beforeEach(() => {
    mockFileContext = getStubProjectFileContext()
  })

  describe('getAgentInstructionsPrompt', () => {
    it('should return empty string when no agent instructions exist', () => {
      const fileContext = {
        ...mockFileContext,
        agentInstructions: {},
      }

      const result = getAgentInstructionsPrompt(fileContext)
      expect(result).toBe('')
    })

    it('should return empty string when agentInstructions is undefined', () => {
      const fileContext = {
        ...mockFileContext,
        agentInstructions: undefined,
      }

      const result = getAgentInstructionsPrompt(fileContext)
      expect(result).toBe('')
    })

    it('should return empty string when agentType is not provided', () => {
      const fileContext = {
        ...mockFileContext,
        agentInstructions: {
          researcher: 'You are a research specialist.',
        },
      }

      const result = getAgentInstructionsPrompt(fileContext)
      expect(result).toBe('')
    })

    it('should return specific agent instruction when agent type matches', () => {
      const fileContext = {
        ...mockFileContext,
        agentInstructions: {
          researcher: 'Always prioritize official documentation when searching',
        },
      }

      const result = getAgentInstructionsPrompt(fileContext, 'researcher')
      expect(result).toBe(
        '\n## Agent-Specific Instructions\n\n**researcher**: Always prioritize official documentation when searching\n'
      )
    })

    it('should return empty string for non-existent agent type', () => {
      const fileContext = {
        ...mockFileContext,
        agentInstructions: {
          researcher: 'Focus on official docs',
        },
      }

      const result = getAgentInstructionsPrompt(fileContext, 'nonexistent')
      expect(result).toBe('')
    })

    it('should handle agent type with special characters', () => {
      const fileContext = {
        ...mockFileContext,
        agentInstructions: {
          'CodebuffAI/git-committer': 'Follow conventional commit format',
        },
      }

      const result = getAgentInstructionsPrompt(
        fileContext,
        'CodebuffAI/git-committer'
      )
      expect(result).toBe(
        '\n## Agent-Specific Instructions\n\n**CodebuffAI/git-committer**: Follow conventional commit format\n'
      )
    })

    it('should only return specific agent instructions even when multiple agents have instructions', () => {
      const fileContext = {
        ...mockFileContext,
        agentInstructions: {
          researcher: 'Focus on official docs',
          reviewer: 'Check for security vulnerabilities',
          thinker: 'Consider edge cases',
        },
      }

      const result = getAgentInstructionsPrompt(fileContext, 'researcher')
      expect(result).toBe(
        '\n## Agent-Specific Instructions\n\n**researcher**: Focus on official docs\n'
      )
      expect(result).not.toContain('reviewer')
      expect(result).not.toContain('thinker')
    })

    it('should handle empty instruction string', () => {
      const fileContext = {
        ...mockFileContext,
        agentInstructions: {
          researcher: '',
        },
      }

      const result = getAgentInstructionsPrompt(fileContext, 'researcher')
      expect(result).toBe('') // Empty string is falsy, so function returns empty string
    })
  })
})
