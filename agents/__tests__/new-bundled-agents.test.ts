import { describe, expect, test } from 'bun:test'

import debuggerAgent from '../debugger/debugger'
import docWriter from '../doc-writer/doc-writer'
import securityReviewer from '../security-reviewer/security-reviewer'
import testWriter from '../test-writer/test-writer'

describe('new bundled agents (M2.6)', () => {
  const agents = [
    { name: 'test-writer', def: testWriter },
    { name: 'security-reviewer', def: securityReviewer },
    { name: 'debugger', def: debuggerAgent },
    { name: 'doc-writer', def: docWriter },
  ]

  for (const { name, def } of agents) {
    describe(`${name}`, () => {
      test('has correct id', () => {
        expect(def.id).toBe(name)
      })

      test('has a display name', () => {
        expect(typeof def.displayName).toBe('string')
        expect(def.displayName.length).toBeGreaterThan(0)
      })

      test('has a non-empty spawner prompt', () => {
        expect(typeof def.spawnerPrompt).toBe('string')
        expect(def.spawnerPrompt!.length).toBeGreaterThan(20)
      })

      test('does not include message history', () => {
        expect(def.includeMessageHistory).toBe(false)
      })

      test('has last_message output mode', () => {
        expect(def.outputMode).toBe('last_message')
      })

      test('has a string prompt input schema', () => {
        expect(def.inputSchema?.prompt?.type).toBe('string')
      })

      test('exposes at least one tool', () => {
        expect((def.toolNames ?? []).length).toBeGreaterThan(0)
      })

      test('has no spawnable agents (leaf agents)', () => {
        expect(def.spawnableAgents ?? []).toEqual([])
      })

      test('has a non-empty system prompt', () => {
        expect(typeof def.systemPrompt).toBe('string')
        expect(def.systemPrompt!.length).toBeGreaterThan(20)
      })

      test('has a non-empty instructions prompt', () => {
        expect(typeof def.instructionsPrompt).toBe('string')
        expect(def.instructionsPrompt!.length).toBeGreaterThan(20)
      })

      test('handleSteps is serializable (function* form)', () => {
        if (!def.handleSteps) return
        const src = def.handleSteps.toString()
        expect(src).toMatch(/^function\*\s*\(/)
        // Must not close over top-level lexical bindings (sandbox-safe).
        expect(() => new Function(`return (${src})`)()).not.toThrow()
      })
    })
  }

  describe('test-writer specifics', () => {
    test('uses flash-lite model', () => {
      expect(testWriter.model).toBeUndefined()
    })

    test('exposes read + write + terminal tools', () => {
      const tools = testWriter.toolNames ?? []
      expect(tools).toContain('read_files')
      expect(tools).toContain('write_file')
      expect(tools).toContain('run_terminal_command')
    })

    test('instructions prompt mentions not modifying source under test', () => {
      expect(testWriter.instructionsPrompt).toContain('Do not modify source')
    })
  })

  describe('security-reviewer specifics', () => {
    test('uses a strong reasoning model', () => {
      expect(securityReviewer.model).toBeUndefined()
    })

    test('instructions prompt covers injection + traversal + auth', () => {
      const p = securityReviewer.instructionsPrompt ?? ''
      expect(p).toContain('injection')
      expect(p).toContain('traversal')
      expect(p).toContain('auth')
    })

    test('does not expose write tools (review only)', () => {
      const tools = securityReviewer.toolNames ?? []
      expect(tools).not.toContain('write_file')
      expect(tools).not.toContain('str_replace')
    })
  })

  describe('debugger specifics', () => {
    test('uses a strong reasoning model', () => {
      expect(debuggerAgent.model).toBeUndefined()
    })

    test('exposes read + terminal + git tools', () => {
      const tools = debuggerAgent.toolNames ?? []
      expect(tools).toContain('read_files')
      expect(tools).toContain('run_terminal_command')
      expect(tools).toContain('git_status')
    })

    test('instructions prompt mentions root cause + does not apply fix', () => {
      const p = debuggerAgent.instructionsPrompt ?? ''
      expect(p).toContain('Root cause')
      expect(p.toLowerCase()).toContain('do not')
    })
  })

  describe('doc-writer specifics', () => {
    test('uses flash-lite model', () => {
      expect(docWriter.model).toBeUndefined()
    })

    test('exposes read + write tools but not terminal', () => {
      const tools = docWriter.toolNames ?? []
      expect(tools).toContain('read_files')
      expect(tools).toContain('str_replace')
      expect(tools).not.toContain('run_terminal_command')
    })

    test('instructions prompt says do not invent', () => {
      expect(docWriter.instructionsPrompt).toContain('Do not invent')
    })
  })
})
