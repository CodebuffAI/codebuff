import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import basher from './basher'
import { createBase2 } from './base2/base2'
import browserUse from './browser-use/browser-use'
import dependencyManager from './dependency-manager/dependency-manager'
import docWriter from './doc-writer/doc-writer'
import { createCodeEditor } from './editor/editor'
import codeSearcher from './file-explorer/code-searcher'
import directoryLister from './file-explorer/directory-lister'
import filePicker from './file-explorer/file-picker'
import globMatcher from './file-explorer/glob-matcher'
import { createGeneralAgent } from './general-agent/general-agent'
import librarian from './librarian/librarian'
import researcherDocs from './researcher/researcher-docs'
import researcherWeb from './researcher/researcher-web'
import codeReviewer from './reviewer/code-reviewer'
import securityReviewer from './security-reviewer/security-reviewer'
import accessibilityReviewer from './specialists/accessibility-reviewer'
import architect from './specialists/architect'
import compatibilityReviewer from './specialists/compatibility-reviewer'
import dependencyReviewer from './specialists/dependency-reviewer'
import docsArchitect from './specialists/docs-architect'
import evaluator from './specialists/evaluator'
import incidentCoordinator from './specialists/incident-coordinator'
import integrationAgent from './specialists/integration-agent'
import migrationReviewer from './specialists/migration-reviewer'
import performanceSpecialist from './specialists/performance-specialist'
import productReviewer from './specialists/product-reviewer'
import releaseManager from './specialists/release-manager'
import reliabilityReviewer from './specialists/reliability-reviewer'
import uxVisualReviewer from './specialists/ux-visual-reviewer'
import synthesizer from './synthesizer/synthesizer'
import testWriter from './test-writer/test-writer'
import thinker from './thinker/thinker'
import tmuxCli from './tmux-cli'
import { quarantinedToolNames } from '@codebuff/common/tools/constants'

/**
 * Guards against the "registered but unusable" failure mode: a tool can be in
 * the runtime registry + generated types yet absent from every agent's
 * `toolNames`, so no agent can ever call it. (This is exactly what happened to
 * read_outline / read_slices / rewrite_symbol on first add.)
 *
 * read_slices remains registered for compatibility but is not prompt-visible.
 *
 * Every orchestrator mode must expose structural reads. Every non-plan
 * orchestrator exposes one canonical transaction surface; compatibility edit
 * tools stay registered at runtime without bloating model-visible tool lists.
 * The obsolete proposal indirection is absent from every bundled mode.
 */
const STRUCTURAL_READ_TOOLS = ['read_outline'] as const
const LEGACY_DIRECT_EDIT_TOOLS = [
  'str_replace',
  'write_file',
  'apply_patch',
  'replace_range',
  'rewrite_symbol',
] as const
const PROPOSAL_TOOLS = [
  'read_proposal_workspace',
  'read_proposals',
  'propose_str_replace',
  'propose_write_file',
  'propose_edit_transaction',
  'accept_proposal',
  'reject_proposal',
  'apply_proposal',
] as const
const HARNESS_STATE_TOOLS = ['git_status'] as const

describe('agent tool reachability', () => {
  for (const mode of ['default', 'fast'] as const) {
    test(`base2 (${mode}) exposes its intended read/mutation surface`, () => {
      const definition = createBase2(mode)
      const tools = definition.toolNames ?? []
      const programmaticTools = definition.programmaticToolNames ?? []
      for (const tool of STRUCTURAL_READ_TOOLS) {
        expect(tools).toContain(tool)
      }
      expect(tools).toContain('read_files')
      expect(tools).toContain('edit_transaction')
      for (const tool of LEGACY_DIRECT_EDIT_TOOLS)
        expect(tools).not.toContain(tool)
      for (const tool of PROPOSAL_TOOLS) {
        expect(tools).not.toContain(tool)
      }
      for (const tool of HARNESS_STATE_TOOLS) {
        expect(programmaticTools).toContain(tool)
      }
    })
  }

  test('execute-plan exposes direct execution without proposal indirection', () => {
    const tools = createBase2('default', { executePlan: true }).toolNames ?? []
    expect(tools).toContain('edit_transaction')
    for (const tool of LEGACY_DIRECT_EDIT_TOOLS)
      expect(tools).not.toContain(tool)
    expect(tools).toContain('run_terminal_command')
    expect(tools).toContain('run_targeted_validation')
    expect(tools).toContain('get_change_review_bundle')
    for (const tool of PROPOSAL_TOOLS) expect(tools).not.toContain(tool)
  })

  test('plan-only excludes project execution and proposal actions', () => {
    const tools = createBase2('default', { planOnly: true }).toolNames ?? []
    expect(tools).not.toContain('edit_transaction')
    for (const tool of LEGACY_DIRECT_EDIT_TOOLS)
      expect(tools).not.toContain(tool)
    expect(tools).not.toContain('run_terminal_command')
    expect(tools).not.toContain('run_targeted_validation')
    expect(tools).toContain('check_background_agent')
    for (const tool of PROPOSAL_TOOLS) expect(tools).not.toContain(tool)
  })

  test('code editor exposes structural edit + read tools', () => {
    const tools = createCodeEditor({ model: 'opus' }).toolNames ?? []
    for (const tool of [
      ...STRUCTURAL_READ_TOOLS,
      'edit_transaction',
    ] as const) {
      expect(tools).toContain(tool)
    }
    for (const tool of LEGACY_DIRECT_EDIT_TOOLS)
      expect(tools).not.toContain(tool)
  })

  test('audit shards receive only derived findings-artifact write authority', () => {
    const definition = createGeneralAgent({ model: 'opus' })

    expect(definition.toolNames).toContain('write_audit_findings')
    expect(definition.toolNames).not.toContain('write_file')
    expect(definition.toolNames).not.toContain('edit_transaction')
    expect(definition.filesystemScope?.write).toEqual([
      '.agents/sessions/*/findings/*.md',
    ])
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
    const defs = [
      thinker,
      createCodeEditor({ model: 'opus' }),
      codeReviewer,
      securityReviewer,
      testWriter,
      docWriter,
      synthesizer,
      dependencyManager,
      researcherWeb,
      researcherDocs,
      basher,
      librarian,
      globMatcher,
      codeSearcher,
      directoryLister,
      filePicker,
      browserUse,
      tmuxCli,
      architect,
      productReviewer,
      integrationAgent,
      performanceSpecialist,
      reliabilityReviewer,
      migrationReviewer,
      accessibilityReviewer,
      uxVisualReviewer,
      compatibilityReviewer,
      dependencyReviewer,
      incidentCoordinator,
      releaseManager,
      docsArchitect,
      evaluator,
    ]

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

      const hasSetOutput =
        tools.includes('set_output') ||
        def.outputMode === 'structured_output'
      if (!hasSetOutput) {
        expect(
          modelVisiblePrompt,
          `${('id' in def ? def.id : undefined) ?? def.displayName ?? 'unknown agent'} must not mention set_output unless it exposes the tool`,
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
