// @ts-ignore
import { describe, expect, it } from 'bun:test'

import {
  CodebuffConfigSchema,
  StartupProcessSchema,
  FileChangeHook,
  codebuffConfigFile,
  codebuffConfigFileBackup,
  type CodebuffConfig,
  type StartupProcess,
} from '../constants'

describe('constants', () => {
  describe('codebuffConfigFile and codebuffConfigFileBackup', () => {
    it('should have correct file names', () => {
      expect(codebuffConfigFile).toBe('codebuff.json')
      expect(codebuffConfigFileBackup).toBe('codebuff.jsonc')
    })
  })

  describe('StartupProcessSchema', () => {
    it('should validate a minimal startup process', () => {
      const validProcess = {
        name: 'test-process',
        command: 'echo hello',
      }
      
      const result = StartupProcessSchema.safeParse(validProcess)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.enabled).toBe(true) // default value
      }
    })

    it('should validate a complete startup process', () => {
      const validProcess = {
        name: 'web-server',
        command: 'npm start',
        cwd: './web',
        enabled: false,
        stdoutFile: 'logs/web.log',
        stderrFile: 'logs/web-error.log',
      }
      
      const result = StartupProcessSchema.safeParse(validProcess)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(validProcess)
      }
    })

    it('should reject startup process with empty name', () => {
      const invalidProcess = {
        name: '',
        command: 'echo hello',
      }
      
      const result = StartupProcessSchema.safeParse(invalidProcess)
      expect(result.success).toBe(false)
    })

    it('should reject startup process with empty command', () => {
      const invalidProcess = {
        name: 'test',
        command: '',
      }
      
      const result = StartupProcessSchema.safeParse(invalidProcess)
      expect(result.success).toBe(false)
    })

    it('should apply default enabled value', () => {
      const process = {
        name: 'test',
        command: 'echo hello',
      }
      
      const result = StartupProcessSchema.safeParse(process)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.enabled).toBe(true)
      }
    })
  })

  describe('FileChangeHook', () => {
    it('should validate a minimal file change hook', () => {
      const validHook = {
        name: 'test-hook',
        command: 'npm test',
      }
      
      const result = FileChangeHook.safeParse(validHook)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.enabled).toBe(true) // default value
      }
    })

    it('should validate a complete file change hook', () => {
      const validHook = {
        name: 'lint-check',
        command: 'eslint .',
        cwd: './src',
        filePattern: '**/*.ts',
        enabled: false,
      }
      
      const result = FileChangeHook.safeParse(validHook)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual(validHook)
      }
    })

    it('should reject hook with empty name', () => {
      const invalidHook = {
        name: '',
        command: 'npm test',
      }
      
      const result = FileChangeHook.safeParse(invalidHook)
      expect(result.success).toBe(false)
    })

    it('should reject hook with empty command', () => {
      const invalidHook = {
        name: 'test',
        command: '',
      }
      
      const result = FileChangeHook.safeParse(invalidHook)
      expect(result.success).toBe(false)
    })
  })

  describe('CodebuffConfigSchema', () => {
    it('should validate an empty object as a valid config', () => {
      const emptyConfig = {}
      
      const result = CodebuffConfigSchema.safeParse(emptyConfig)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.maxAgentSteps).toBe(12) // default value
        expect(result.data.description).toBeUndefined()
        expect(result.data.startupProcesses).toBeUndefined()
        expect(result.data.fileChangeHooks).toBeUndefined()
      }
    })

    it('should validate a minimal config with description only', () => {
      const config = {
        description: 'My project config',
      }
      
      const result = CodebuffConfigSchema.safeParse(config)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.description).toBe('My project config')
        expect(result.data.maxAgentSteps).toBe(12)
      }
    })

    it('should validate a complete config', () => {
      const config = {
        description: 'Full configuration',
        startupProcesses: [
          {
            name: 'web-server',
            command: 'npm start',
            cwd: './web',
            stdoutFile: 'logs/web.log',
          },
        ],
        fileChangeHooks: [
          {
            name: 'test-runner',
            command: 'npm test',
            filePattern: '**/*.ts',
          },
        ],
        maxAgentSteps: 20,
      }
      
      const result = CodebuffConfigSchema.safeParse(config)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({
          ...config,
          startupProcesses: [
            {
              ...config.startupProcesses[0],
              enabled: true, // default value
            },
          ],
          fileChangeHooks: [
            {
              ...config.fileChangeHooks[0],
              enabled: true, // default value
            },
          ],
        })
      }
    })

    it('should accept any type for description field', () => {
      const configs = [
        { description: 'string description' },
        { description: 42 },
        { description: true },
        { description: { nested: 'object' } },
        { description: ['array', 'values'] },
        { description: null },
      ]
      
      configs.forEach((config) => {
        const result = CodebuffConfigSchema.safeParse(config)
        expect(result.success).toBe(true)
      })
    })

    it('should apply default maxAgentSteps value', () => {
      const config = {
        description: 'Test config',
      }
      
      const result = CodebuffConfigSchema.safeParse(config)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.maxAgentSteps).toBe(12)
      }
    })

    it('should allow custom maxAgentSteps value', () => {
      const config = {
        maxAgentSteps: 25,
      }
      
      const result = CodebuffConfigSchema.safeParse(config)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.maxAgentSteps).toBe(25)
      }
    })

    it('should reject invalid startup process in array', () => {
      const config = {
        startupProcesses: [
          {
            name: '', // invalid: empty name
            command: 'npm start',
          },
        ],
      }
      
      const result = CodebuffConfigSchema.safeParse(config)
      expect(result.success).toBe(false)
    })

    it('should reject invalid file change hook in array', () => {
      const config = {
        fileChangeHooks: [
          {
            name: 'test',
            command: '', // invalid: empty command
          },
        ],
      }
      
      const result = CodebuffConfigSchema.safeParse(config)
      expect(result.success).toBe(false)
    })

    it('should reject non-number maxAgentSteps', () => {
      const config = {
        maxAgentSteps: 'not-a-number',
      }
      
      const result = CodebuffConfigSchema.safeParse(config)
      expect(result.success).toBe(false)
    })

    it('should reject non-array startupProcesses', () => {
      const config = {
        startupProcesses: 'not-an-array',
      }
      
      const result = CodebuffConfigSchema.safeParse(config)
      expect(result.success).toBe(false)
    })

    it('should reject non-array fileChangeHooks', () => {
      const config = {
        fileChangeHooks: 'not-an-array',
      }
      
      const result = CodebuffConfigSchema.safeParse(config)
      expect(result.success).toBe(false)
    })
  })

  describe('TypeScript types', () => {
    it('should have correct TypeScript types', () => {
      // This test ensures the types are properly exported and inferred
      const startupProcess: StartupProcess = {
        name: 'test',
        command: 'echo hello',
        enabled: true,
      }
      
      const config: CodebuffConfig = {
        description: 'Test config',
        startupProcesses: [startupProcess],
        maxAgentSteps: 15,
      }
      
      // If this compiles without TypeScript errors, the types are correct
      expect(startupProcess.name).toBe('test')
      expect(config.maxAgentSteps).toBe(15)
    })
  })
})
