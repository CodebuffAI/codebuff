import { describe, expect, test } from 'bun:test'

import { getToolSet } from '@codebuff/agent-runtime/tools/prompts'
import { countTokensJson } from '@codebuff/agent-runtime/util/token-counter'

import { createBase2 } from '../base2/base2'

import type { SkillsMap } from '@codebuff/common/types/skill'

function buildRepresentativeSkills(count: number): SkillsMap {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const name = `skill-${index}`
      return [
        name,
        {
          name,
          description: `Representative skill ${index}: ${'detailed capability guidance '.repeat(12)}`,
          content: `# ${name}`,
          filePath: `/skills/${name}/SKILL.md`,
        },
      ]
    }),
  )
}

describe('base2 provider-facing context budget', () => {
  test('keeps the stable root tool surface below 25k estimated tokens', async () => {
    const base2 = createBase2('default')
    const tools = await getToolSet({
      toolNames: base2.toolNames ?? [],
      additionalToolDefinitions: async () => ({}),
      agentTools: {},
      skills: buildRepresentativeSkills(40),
    })
    const tokenShape = Object.entries(tools).map(([name, tool]) => {
      const inputSchema = (tool as { inputSchema?: unknown }).inputSchema
      return {
        name,
        ...(tool.description && { description: tool.description }),
        ...(inputSchema ? { input_schema: inputSchema } : {}),
      }
    })

    expect(base2.spawnableAgentToolMode).toBe('generic')
    expect(Object.keys(tools)).toHaveLength(base2.toolNames?.length ?? 0)
    expect(countTokensJson(tokenShape)).toBeLessThan(25_000)
  })
})
