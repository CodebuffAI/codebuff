import { describe, expect, it } from 'bun:test'

import { gitBranchParams } from '../git-branch'

describe('gitBranchParams', () => {
  describe('static metadata', () => {
    it('exposes toolName === "git_branch"', () => {
      expect(gitBranchParams.toolName).toBe('git_branch')
    })

    it('ends the agent step', () => {
      expect(gitBranchParams.endsAgentStep).toBe(true)
    })
  })

  describe('inputSchema', () => {
    it('rejects a missing branch_name', () => {
      const result = gitBranchParams.inputSchema.safeParse({})
      expect(result.success).toBe(false)
    })

    it('rejects an empty branch_name', () => {
      const result = gitBranchParams.inputSchema.safeParse({ branch_name: '' })
      expect(result.success).toBe(false)
    })

    it('rejects a non-string branch_name', () => {
      const result = gitBranchParams.inputSchema.safeParse({
        branch_name: 42,
      })
      expect(result.success).toBe(false)
    })

    it('accepts a non-empty branch_name and defaults switch and allow_dirty', () => {
      const result = gitBranchParams.inputSchema.safeParse({
        branch_name: 'feat/my-feature',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.branch_name).toBe('feat/my-feature')
        expect(result.data.switch).toBe(true)
        expect(result.data.allow_dirty).toBe(false)
      }
    })

    it('accepts switch: false explicitly', () => {
      const result = gitBranchParams.inputSchema.safeParse({
        branch_name: 'feat/x',
        switch: false,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.switch).toBe(false)
      }
    })

    it('accepts allow_dirty: true explicitly', () => {
      const result = gitBranchParams.inputSchema.safeParse({
        branch_name: 'feat/x',
        allow_dirty: true,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.allow_dirty).toBe(true)
      }
    })
  })

  describe('outputSchema', () => {
    it('accepts a success value with branch/created/switched', () => {
      const result = gitBranchParams.outputSchema.safeParse([
        {
          type: 'json',
          value: {
            branch: 'feat/my-feature',
            created: true,
            switched: true,
          },
        },
      ])
      expect(result.success).toBe(true)
    })

    it('accepts a success value including previousBranch', () => {
      const result = gitBranchParams.outputSchema.safeParse([
        {
          type: 'json',
          value: {
            branch: 'feat/my-feature',
            created: true,
            switched: true,
            previousBranch: 'main',
          },
        },
      ])
      expect(result.success).toBe(true)
    })

    it('accepts an error value with errorMessage', () => {
      const result = gitBranchParams.outputSchema.safeParse([
        {
          type: 'json',
          value: {
            errorMessage: 'working tree is dirty',
          },
        },
      ])
      expect(result.success).toBe(true)
    })
  })
})
