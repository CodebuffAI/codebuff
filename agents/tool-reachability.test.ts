import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { createBase2 } from './base2/base2'
import { createCodeEditor } from './editor/editor'
import thinker from './thinker/thinker'
import { quarantinedToolNames } from '@codebuff/common/tools/constants'

/**
 * Guards against the "registered but unusable" failure mode: a tool can be in
 * the runtime registry + generated types yet absent from every agent's
 * `toolNames`, so no agent can ever call it. (This is exactly what happened to
 * read_outline / read_slices / rewrite_symbol on first add.)
 *
 * read_slices remains registered for compatibility but is not prompt-visible.
 *
 * The orchestrator (base2, all modes) must expose the structural read/edit
 * tools, and the direct code editor must expose the structural edit tools.
 */
const STRUCTURAL_READ_TOOLS = ['read_outline'] as const
const STRUCTURAL_EDIT_TOOLS = ['rewrite_symbol'] as const
const HARNESS_STATE_TOOLS = ['git_status'] as const

describe('agent tool reachability', () => {
  for (const mode of ['default', 'fast'] as const) {
    test(`base2 (${mode}) exposes structural read + edit tools`, () => {
      const definition = createBase2(mode)
      const tools = definition.toolNames ?? []
      const programmaticTools = definition.programmaticToolNames ?? []
      for (const tool of [...STRUCTURAL_READ_TOOLS, ...STRUCTURAL_EDIT_TOOLS]) {
        expect(tools).toContain(tool)
      }
      // Core read/edit tools must remain reachable too.
      for (const tool of [
        'read_files',
        'str_replace',
        'write_file',
        'apply_patch',
        'read_proposal_workspace',
        'read_proposals',
        'propose_str_replace',
        'propose_write_file',
        'propose_edit_transaction',
        'accept_proposal',
        'reject_proposal',
        'apply_proposal',
      ] as const) {
        expect(tools).toContain(tool)
      }
      for (const tool of HARNESS_STATE_TOOLS) {
        expect(programmaticTools).toContain(tool)
      }
    })
  }

  test('code editor exposes structural edit + read tools', () => {
    const tools = createCodeEditor({ model: 'opus' }).toolNames ?? []
    for (const tool of [...STRUCTURAL_READ_TOOLS, ...STRUCTURAL_EDIT_TOOLS]) {
      expect(tools).toContain(tool)
    }
  })

  test('shipped primary agents do not expose quarantined compatibility tools', () => {
    const definitions = [
      createBase2('default'),
      createBase2('fast'),
      createCodeEditor({ model: 'opus' }),
    ]

    for (const definition of definitions) {
      for (const toolName of quarantinedToolNames) {
        expect(
          definition.toolNames ?? [],
          `${definition.displayName} must not expose quarantined tool ${toolName}`,
        ).not.toContain(toolName)
      }
    }
  })
})

describe('agent prompt/tool availability alignment', () => {
  test('prompts and docs align restored compatibility tools', () => {
    const repoRoot = path.resolve(import.meta.dir, '..')
    const runtimePrompts = readFileSync(
      path.join(repoRoot, 'packages/agent-runtime/src/tools/prompts.ts'),
      'utf8',
    )
    const toolsDoc = readFileSync(
      path.join(repoRoot, 'docs/agents-and-tools.md'),
      'utf8',
    )

    expect(runtimePrompts).not.toContain('Prefer \\`read_slices\\`')
    expect(runtimePrompts).not.toContain('Prefer \\`apply_smart_patch\\`')
    expect(toolsDoc).toContain('`read_slices` (deprecated compatibility alias)')
    expect(toolsDoc).toContain('### `apply_smart_patch`')
  })

  test('structured-output agents without set_output do not prompt the model to call it', () => {
    const defs = [thinker]

    for (const def of defs) {
      const tools = def.toolNames ?? []
      const modelVisiblePrompt = [
        def.spawnerPrompt,
        def.systemPrompt,
        def.instructionsPrompt,
        def.stepPrompt,
      ]
        .filter(Boolean)
        .join('\n')

      if (!tools.includes('set_output')) {
        expect(
          modelVisiblePrompt,
          `${def.id} must not mention set_output unless it exposes the tool`,
        ).not.toContain('set_output')
      }
    }
  })
})

/**
 * Guard against re-introducing references to removed agent IDs. The
 * `base-max`, `multi-prompt`, and `best-of-n` agent definitions were
 * deleted; no active orchestrator should still try to spawn them or list
 * them as spawnable, and the editor/reviewer agent IDs they pointed at
 * should not reappear in active definitions.
 *
 * This is intentionally narrow: it only checks the two main orchestrators
 * (base2 + base-deep) and the editor, not every file in the repo, so it
 * stays robust as the codebase evolves.
 */
const REMOVED_AGENT_IDS = [
  'base-max',
  'base_max',
  'multi-prompt',
  'multi_prompt',
  'best-of-n',
  'best_of_n',
] as const

describe('agent registry/reference cleanup', () => {
  test('base2 (default+fast) does not reference removed agent ids', () => {
    for (const mode of ['default', 'fast'] as const) {
      const def = createBase2(mode)
      const spawnable = def.spawnableAgents ?? []
      for (const removed of REMOVED_AGENT_IDS) {
        expect(
          spawnable,
          `base2 (${mode}) spawnableAgents must not include removed id ${removed}`,
        ).not.toContain(removed)
      }
      // System/instructions prompts should not bake in removed agent names
      // as authoritative recommendations.
      const promptText = `${def.systemPrompt ?? ''}\n${def.instructionsPrompt ?? ''}\n${def.stepPrompt ?? ''}`
      for (const removed of REMOVED_AGENT_IDS) {
        expect(
          promptText.includes(`@${removed}`),
          `base2 (${mode}) prompt must not @-mention removed agent ${removed}`,
        ).toBe(false)
      }
    }
  })

  test('code editor does not list removed agent ids as spawnable', () => {
    const editor = createCodeEditor({ model: 'opus' })
    const spawnable = editor.spawnableAgents ?? []
    for (const removed of REMOVED_AGENT_IDS) {
      expect(spawnable).not.toContain(removed)
    }
  })
})
