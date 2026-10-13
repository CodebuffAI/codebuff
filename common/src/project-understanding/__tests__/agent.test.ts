import { describe, expect, test } from 'bun:test'

import {
  PROJECT_UNDERSTANDING_ANSWER_NOW,
  PROJECT_UNDERSTANDING_CONTINUATION,
  PROJECT_UNDERSTANDING_MAX_AGENT_STEPS,
  PROJECT_UNDERSTANDING_OPENING,
  PROJECT_UNDERSTANDING_READING_ROUNDS,
  PROJECT_UNDERSTANDING_TOOL_NAMES,
  buildProjectUnderstandingAgent,
} from '../agent'
import { PROJECT_UNDERSTANDING_MAX_READ_BYTES } from '../skipped-files'

import type { ProjectUnderstandingTemplate } from '../template'

const TEMPLATE: ProjectUnderstandingTemplate = {
  version: 1,
  sections: [
    {
      key: 'stack',
      title: 'Stack',
      fields: [{ key: 'frameworks', kind: 'names', label: 'Frameworks' }],
    },
  ],
}

describe('buildProjectUnderstandingAgent', () => {
  const agent = buildProjectUnderstandingAgent(TEMPLATE)
  // The runtime evals handleSteps from its source, so it repeats these values
  // as literals instead of importing them.
  const source = String(agent.handleSteps)

  test('handleSteps reads for the pinned number of rounds, then asks for the answer', () => {
    // (the message itself is pinned by the never-answers test below)
    expect(source).toContain(`round < ${PROJECT_UNDERSTANDING_READING_ROUNDS}`)
  })

  test('the step ceiling leaves room for every reading round and the answer', () => {
    expect(PROJECT_UNDERSTANDING_MAX_AGENT_STEPS).toBeGreaterThan(
      PROJECT_UNDERSTANDING_READING_ROUNDS + 1,
    )
  })

  test('opens with the sentences the server pins, and says what is never read', () => {
    expect(agent.systemPrompt).toStartWith(
      `${PROJECT_UNDERSTANDING_OPENING} ${PROJECT_UNDERSTANDING_CONTINUATION}\n`,
    )
    // skipped-files.ts refuses these; the prompt says so, and never asks for a lockfile.
    expect(agent.systemPrompt).toContain(
      `Lockfiles, generated files (minified bundles, source maps, anything under node_modules, a virtualenv or a build folder) and files over ${PROJECT_UNDERSTANDING_MAX_READ_BYTES / 1024} KB are not read either: their names are evidence enough.`,
    )
    expect(agent.systemPrompt).not.toContain('manifests and lockfiles')
  })

  test('offers exactly the read-only tools the completions gate allows', () => {
    expect(agent.toolNames).toEqual([...PROJECT_UNDERSTANDING_TOOL_NAMES])
    expect(agent.toolNames).not.toContain('add_message')
  })

  test('stops reading as soon as the model has answered', () => {
    const steps = agent.handleSteps!({} as never)
    steps.next() // list_directory
    steps.next({} as never) // glob
    expect(steps.next({} as never).value).toBe('STEP')
    const after = steps.next({
      agentState: { output: { stack: { frameworks: [] } } },
      stepsComplete: false,
    } as never)
    expect(after.done).toBe(true)
  })

  test('a model that never answers is told to, once its rounds are spent', () => {
    const steps = agent.handleSteps!({} as never)
    steps.next()
    steps.next({} as never)
    let value = steps.next({} as never).value
    for (let round = 0; round < PROJECT_UNDERSTANDING_READING_ROUNDS; round++) {
      expect(value).toBe('STEP')
      value = steps.next({
        agentState: { output: undefined },
        stepsComplete: false,
      } as never).value
    }
    expect(value).toMatchObject({
      toolName: 'add_message',
      input: { role: 'user', content: PROJECT_UNDERSTANDING_ANSWER_NOW },
      includeToolCall: false,
    })
    expect(steps.next({} as never).value).toBe('STEP')
  })
})
