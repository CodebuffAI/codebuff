import { describe, expect, test } from 'bun:test'

import { createBaseDeep } from '../base2/base-deep'
import { createBase2 } from '../base2/base2'

describe('base2 validation/reviewer coordination prompts', () => {
  test('requires joining parallel validation and review before finalizing', () => {
    const base2 = createBase2('default')

    expect(base2.systemPrompt).toContain('Validation/review join discipline')
    expect(base2.systemPrompt).toContain(
      'Do not treat parallel reviewer approval as final approval until validation has completed',
    )
    expect(base2.systemPrompt).toContain(
      'validation failure/timeout blocks completion even if review looks good',
    )
    expect(base2.instructionsPrompt).toContain('compact implementation brief')
    expect(base2.systemPrompt).toContain('product, Openbuff')
    expect(base2.systemPrompt).not.toContain('product, Codebuff')
    expect(base2.systemPrompt).toContain(
      'the default runtime automatically runs configured validation hooks and a code-reviewer gate',
    )
    expect(base2.systemPrompt).not.toContain(
      '- Spawn a code-reviewer to review the changes after you have implemented the changes.',
    )
    expect(base2.instructionsPrompt).not.toContain(
      'Spawn a code-reviewer to review the changes after you have implemented changes',
    )
    expect(base2.stepPrompt).toContain('independently detect changed files')
    expect(base2.systemPrompt).toContain('Prefer dedicated harness tools')
    expect(base2.systemPrompt).toContain('Use git_status for repository status/diffs instead of basher')
    expect(base2.systemPrompt).toContain('Atomic transaction recovery')
    expect(base2.instructionsPrompt).toContain(
      'do not substitute basher for git status or file discovery',
    )
  })
})

describe('base-deep prompt naming and tool guidance', () => {
  test('uses Openbuff naming and current tool preferences', () => {
    const baseDeep = createBaseDeep()

    expect(baseDeep.systemPrompt).toContain('product, Openbuff')
    expect(baseDeep.systemPrompt).not.toContain('product, Codebuff')
    expect(baseDeep.systemPrompt).not.toContain('directory-lister, glob-matcher')
    expect(baseDeep.systemPrompt).not.toContain('Prefer apply_patch for existing-file edits')
    expect(baseDeep.systemPrompt).toContain('Prefer rewrite_symbol for whole-symbol edits')
    expect(baseDeep.instructionsPrompt).not.toContain('Prefer apply_patch for edits')
    expect(baseDeep.instructionsPrompt).toContain('Prefer rewrite_symbol for whole-symbol edits')
    expect(baseDeep.toolNames).toEqual(expect.arrayContaining(['read_outline', 'list_directory', 'glob', 'git_status', 'str_replace', 'edit_transaction']))
  })
})

describe('base2 proactive index lookup', () => {
  test('starts codebase-oriented prompts with query_index', () => {
    const base2 = createBase2('default')
    const generator = base2.handleSteps!({
      prompt: 'Where is authentication configured in this codebase?',
      params: {},
    } as any)

    expect(generator.next().value).toEqual({
      toolName: 'query_index',
      input: {
        query: 'Where is authentication configured in this codebase?',
        limit: 20,
      },
    })
  })

  test('does not query_index for generic chat prompts', () => {
    const base2 = createBase2('default')
    const generator = base2.handleSteps!({
      prompt: 'How are you doing today?',
      params: {},
    } as any)

    expect(generator.next().value).toMatchObject({
      toolName: 'git_status',
      input: {},
    })
  })
})

describe('base2 verification and reviewer gates', () => {
  test('serialized handleSteps does not depend on createBase2 closure variables', () => {
    const base2 = createBase2('default')
    const serializedHandleSteps = new Function(
      `return (${base2.handleSteps!.toString()})`,
    )() as NonNullable<typeof base2.handleSteps>
    const gen = serializedHandleSteps({
      agentState: { agentId: 'base2' },
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'run_file_change_hooks' })
  })

  test('failed verification hooks reopen the turn so failures get fixed', () => {
    const base2 = createBase2('default')
    const gen = base2.handleSteps!({
      agentState: { agentId: 'base2' },
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'context-pruner' },
    })
    expect(gen.next().value).toBe('STEP')
    const afterStep = gen.next({
      stepsComplete: true,
      toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
    } as any)
    expect(afterStep.value).toMatchObject({ toolName: 'git_status' })
    const afterGit = gen.next({
      toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
    } as any)
    expect(afterGit.value).toMatchObject({ toolName: 'run_file_change_hooks' })

    const afterHooks = gen.next({
      toolResult: [
        {
          type: 'json',
          value: [{ hookName: 'typecheck', exitCode: 1, stderr: 'TS2322' }],
        },
      ],
    } as any)
    expect(afterHooks.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    const text = (afterHooks.value as any).input.content as string
    expect(text).toContain('Verification gate')
  })

  test('passing verification hooks trigger code review before completion', () => {
    const base2 = createBase2('default')
    const gen = base2.handleSteps!({
      agentState: { agentId: 'base2' },
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    const afterStep = gen.next({
      stepsComplete: true,
      toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
    } as any)
    expect(afterStep.value).toMatchObject({ toolName: 'git_status' })
    const afterGit = gen.next({
      toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
    } as any)
    expect(afterGit.value).toMatchObject({ toolName: 'run_file_change_hooks' })
    const afterHooks = gen.next({ toolResult: [{ type: 'json', value: [] }] } as any)
    expect(afterHooks.value).toMatchObject({
      toolName: 'spawn_agents',
      input: { agents: [{ agent_type: 'code-reviewer' }] },
    })
    const done = gen.next({
      toolResult: [{ type: 'json', value: ['LOOKS_GOOD: No issues found.'] }],
    } as any)
    expect(done.done).toBe(true)
  })

  test('ignores non-edit tool results with file fields when detecting changes', () => {
    const base2 = createBase2('default')
    const gen = base2.handleSteps!({
      agentState: { agentId: 'base2' },
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [
          {
            type: 'json',
            value: {
              file: 'src/read-only.ts',
              errorMessage: 'read_files failed',
            },
          },
        ],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const done = gen.next({
      toolResult: [{ type: 'json', value: { status: '' } }],
    } as any)

    expect(done.done).toBe(true)
  })

  test('uses editor structured output changedFiles when child edit details are absent', () => {
    const base2 = createBase2('default')
    const gen = base2.handleSteps!({
      agentState: { agentId: 'base2' },
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [
          {
            type: 'json',
            value: { output: { changedFiles: ['src/from-editor.ts'] } },
          },
        ],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const afterGit = gen.next({
      toolResult: [{ type: 'json', value: { status: '' } }],
    } as any)

    expect(afterGit.value).toMatchObject({
      toolName: 'run_file_change_hooks',
      input: { files: ['src/from-editor.ts'] },
    })
  })

  test('fast/no-validation mode skips file-change hooks after edits', () => {
    const base2 = createBase2('fast')
    const gen = base2.handleSteps!({
      agentState: { agentId: 'base2-fast' },
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    const done = gen.next({
      toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
    } as any)

    expect(done.done).toBe(true)
  })

  test('blocking reviewer feedback reopens the turn', () => {
    const base2 = createBase2('default')
    const gen = base2.handleSteps!({
      agentState: { agentId: 'base2' },
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    expect(gen.next().value).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: { status: '' } }] } as any)
        .value,
    ).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    expect(
      gen.next({
        stepsComplete: true,
        toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'git_status' })
    expect(
      gen.next({
        toolResult: [{ type: 'json', value: { status: ' M src/a.ts' } }],
      } as any).value,
    ).toMatchObject({ toolName: 'run_file_change_hooks' })
    expect(
      gen.next({ toolResult: [{ type: 'json', value: [] }] } as any).value,
    ).toMatchObject({ toolName: 'spawn_agents' })
    const afterReview = gen.next({
      toolResult: [{ type: 'json', value: ['BLOCKING: Fix the edge case.'] }],
    } as any)

    expect(afterReview.value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user' },
    })
    expect((afterReview.value as any).input.content).toContain('Reviewer gate')
  })
})
