import { describe, expect, test } from 'bun:test'

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
    expect(base2.instructionsPrompt).toContain('static code review only')
    expect(base2.stepPrompt).toContain('wait for both results before finalizing')
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
      toolName: 'spawn_agent_inline',
      input: {
        agent_type: 'context-pruner',
      },
    })
  })
})

describe('base2 verification gate + best-of-N escalation', () => {
  test('default mode can spawn editor-multi-prompt for escalation', () => {
    const base2 = createBase2('default')
    expect(base2.spawnableAgents).toContain('editor')
    expect(base2.spawnableAgents).toContain('editor-multi-prompt')
  })

  test('failed verification hooks reopen the turn and suggest escalation', () => {
    const base2 = createBase2('default')
    const gen = base2.handleSteps!({
      prompt: 'Make the requested change now please',
      params: {},
    } as any)

    // context-pruner runs inline first
    expect(gen.next().value).toMatchObject({
      toolName: 'spawn_agent_inline',
      input: { agent_type: 'context-pruner' },
    })
    // then the model takes a step
    expect(gen.next().value).toBe('STEP')
    // model signals completion after producing an edit
    const afterStep = gen.next({
      stepsComplete: true,
      toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
    } as any)
    expect(afterStep.value).toMatchObject({ toolName: 'run_file_change_hooks' })
    // a configured hook fails
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
    expect(text).toContain('editor-multi-prompt')
  })

  test('passing verification hooks let the turn complete', () => {
    const base2 = createBase2('default')
    const gen = base2.handleSteps!({
      prompt: 'Make the requested change now please',
      params: {},
    } as any)
    expect(gen.next().value).toMatchObject({ toolName: 'spawn_agent_inline' })
    expect(gen.next().value).toBe('STEP')
    const afterStep = gen.next({
      stepsComplete: true,
      toolResult: [{ type: 'json', value: { file: 'src/a.ts' } }],
    } as any)
    expect(afterStep.value).toMatchObject({ toolName: 'run_file_change_hooks' })
    // hooks return an empty result set (no failures) -> turn ends
    const done = gen.next({ toolResult: [{ type: 'json', value: [] }] } as any)
    expect(done.done).toBe(true)
  })
})
