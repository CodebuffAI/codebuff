import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, expect, it } from 'bun:test'

import { toolNames } from '../constants'
import { compileToolDefinitions } from '../compile-tool-definitions'
import { toolParams } from '../list'

/**
 * Guards against the "added here but missing there" failure mode that caused the
 * edit_transaction rollout to break: a tool name present in one registry but
 * absent from another. This test fails loudly whenever a tool is added/removed
 * from one place without being synced everywhere else.
 *
 * Note: the runtime handler map (packages/agent-runtime) is intentionally NOT
 * imported here to keep common free of agent-runtime deps; the readiness script
 * (scripts/check-tool-registration.ts) covers the handler dimension.
 */
describe('tool registration consistency', () => {
  const repoRoot = join(import.meta.dir, '..', '..', '..', '..')

  const readToolNameUnion = (relativePath: string): Set<string> => {
    const source = readFileSync(join(repoRoot, relativePath), 'utf8')
    const unionMatch = source.match(
      /export type ToolName =([\s\S]*?)\n\n/,
    )
    expect(unionMatch).not.toBeNull()
    const names = (unionMatch?.[1] ?? '')
      .split('|')
      .map((part) => part.trim().replace(/['"]/g, ''))
      .filter((part) => part.length > 0)
    return new Set(names)
  }

  it('toolParams (list.ts) has exactly the tools in toolNames (constants.ts)', () => {
    const paramKeys = Object.keys(toolParams).sort()
    expect(paramKeys).toEqual([...toolNames].sort())
  })

  it('each toolParams entry self-reports its own tool name', () => {
    for (const name of toolNames) {
      expect(toolParams[name].toolName).toBe(name)
    }
  })

  it('read_docs max_tokens default matches its descriptions', () => {
    const parsed = toolParams.read_docs.inputSchema.parse({
      libraryTitle: 'React',
      topic: 'hooks',
    })

    expect(parsed.max_tokens).toBe(10_000)
    expect(toolParams.read_docs.description).not.toContain('Defaults to 20000')

    const generatedFiles = [
      'agents/types/tools.ts',
      'common/src/templates/initial-agents-dir/types/tools.ts',
    ]
    for (const file of generatedFiles) {
      const source = readFileSync(join(repoRoot, file), 'utf8')
      expect(source).not.toContain('Defaults to 20000')
      expect(source).toContain('Defaults to 10000')
    }
  })

  it('generated agent tool types include every published-style tool name', () => {
    // These generated type files are what custom agents type-check against.
    // They must stay in sync with the canonical toolNames so agents can never
    // reference a tool name that the type surface does not recognize.
    const generatedFiles = [
      'agents/types/tools.ts',
      'common/src/templates/initial-agents-dir/types/tools.ts',
    ]

    // The generated types intentionally omit a few internal-only tools.
    const internalOnlyTools = new Set([
      'add_subgoal',
      'browser_logs',
      'create_plan',
      'replace_range',
      'spawn_agent_inline',
      'update_subgoal',
    ])
    const expected = new Set(
      [...toolNames].filter((name) => !internalOnlyTools.has(name)),
    )

    for (const file of generatedFiles) {
      const declared = readToolNameUnion(file)
      const missing = [...expected].filter((name) => !declared.has(name))
      const unexpected = [...declared].filter(
        (name) => !toolNames.includes(name as (typeof toolNames)[number]),
      )
      expect({ file, missing, unexpected }).toEqual({
        file,
        missing: [],
        unexpected: [],
      })
    }
  })
})
