import {
  FREEBUFF_PROJECTS_MAX_LIVE_SUBAGENTS,
  FREEBUFF_PROJECTS_SUBAGENT_ID,
} from '@codebuff/common/constants/free-agents'
import { MAX_LIVE_SUBAGENTS_PER_ROOT } from '@codebuff/common/tools/params/tool/spawn-agents'
import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { assistantMessage } from '@codebuff/common/util/messages'
import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'

import { mockFileContext } from './test-utils'
import * as runAgentStep from '../run-agent-step'
import {
  handleSpawnAgents,
  liveCappedAgentCountForTests,
} from '../tools/handlers/tool/spawn-agents'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'

const template = (
  id: string,
  spawnableAgents: string[] = [],
): AgentTemplate => ({
  id,
  displayName: id,
  outputMode: 'last_message' as const,
  inputSchema: {
    prompt: {
      safeParse: () => ({ success: true }),
    } as unknown as AgentTemplate['inputSchema']['prompt'],
  },
  spawnerPrompt: '',
  model: '',
  includeMessageHistory: false,
  inheritParentSystemPrompt: false,
  mcpServers: {},
  toolNames: [],
  spawnableAgents,
  systemPrompt: '',
  instructionsPrompt: '',
  stepPrompt: '',
})

type State = ReturnType<typeof getInitialSessionState>['mainAgentState']

const spawnFrom = (
  state: State,
  parent: AgentTemplate,
  templates: Record<string, AgentTemplate>,
  agentType: string,
  count: number,
  tag: string,
) =>
  handleSpawnAgents({
    ...TEST_AGENT_RUNTIME_IMPL,
    ancestorRunIds: state.ancestorRunIds,
    clientSessionId: 'session',
    fileContext: mockFileContext,
    fingerprintId: 'fp',
    previousToolCallFinished: Promise.resolve(),
    repoId: undefined,
    repoUrl: undefined,
    sendSubagentChunk: () => {},
    signal: new AbortController().signal,
    system: 'system',
    userId: TEST_USER_ID,
    userInputId: 'input',
    writeToClient: () => {},
    agentState: state,
    agentTemplate: parent,
    localAgentTemplates: templates,
    toolCall: {
      toolName: 'spawn_agents',
      toolCallId: tag,
      input: {
        agents: Array.from({ length: count }, () => ({
          agent_type: agentType,
          prompt: 'work',
        })),
      },
    },
  })

const refusalsIn = (outputs: string[], cap: number, label: string) =>
  outputs.join('').split(`at most ${cap} ${label}`).length - 1

/** A spawn reserves its slots a microtask after it is called and does no I/O
 *  first, so once the next macrotask runs every pending reservation is made. */
const drainMicrotasks = () =>
  new Promise<void>((resolve) => setImmediate(resolve))

/** Resolves once `ready` holds; call `notify` after every counter change. */
const waiters = () => {
  const pending: Array<{ ready: () => boolean; resolve: () => void }> = []
  const notify = () => {
    for (const waiter of pending) if (waiter.ready()) waiter.resolve()
  }
  const until = (ready: () => boolean) => {
    const done = Promise.withResolvers<void>()
    pending.push({ ready, resolve: done.resolve })
    notify()
    return done.promise
  }
  return { notify, until }
}

describe('the live subagent caps', () => {
  afterEach(() => mock.restore())

  it(`runs at most ${FREEBUFF_PROJECTS_MAX_LIVE_SUBAGENTS} at once under one root, across concurrent batches`, async () => {
    const gate = Promise.withResolvers<void>()
    let started = 0
    spyOn(runAgentStep, 'loopAgentSteps').mockImplementation(
      async (options) => {
        started++
        await gate.promise
        return {
          agentState: options.agentState,
          output: { type: 'lastMessage', value: [assistantMessage('done')] },
        }
      },
    )
    const root = template('root', [FREEBUFF_PROJECTS_SUBAGENT_ID])
    const subagent = template(FREEBUFF_PROJECTS_SUBAGENT_ID)
    const spawn = (runId: string, count: number) => {
      const state = getInitialSessionState(mockFileContext).mainAgentState
      state.runId = runId
      return handleSpawnAgents({
        ...TEST_AGENT_RUNTIME_IMPL,
        ancestorRunIds: [],
        clientSessionId: 'session',
        fileContext: mockFileContext,
        fingerprintId: 'fp',
        previousToolCallFinished: Promise.resolve(),
        repoId: undefined,
        repoUrl: undefined,
        sendSubagentChunk: () => {},
        signal: new AbortController().signal,
        system: 'system',
        userId: TEST_USER_ID,
        userInputId: 'input',
        writeToClient: () => {},
        agentState: state,
        agentTemplate: root,
        localAgentTemplates: { [FREEBUFF_PROJECTS_SUBAGENT_ID]: subagent },
        toolCall: {
          toolName: 'spawn_agents',
          toolCallId: `call-${runId}-${count}`,
          input: {
            agents: Array.from({ length: count }, () => ({
              agent_type: FREEBUFF_PROJECTS_SUBAGENT_ID,
              prompt: 'work',
            })),
          },
        },
      })
    }

    // Parallel calls of six until past the cap: more asked than may run.
    const calls = Math.ceil(FREEBUFF_PROJECTS_MAX_LIVE_SUBAGENTS / 6) + 1
    const asked = calls * 6
    const batches = Array.from({ length: calls }, () => spawn('root-a', 6))
    // Another session is not held to root-a's count.
    const other = spawn('root-b', 6)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(started).toBe(FREEBUFF_PROJECTS_MAX_LIVE_SUBAGENTS + 6)
    gate.resolve()
    const outputs = (await Promise.all(batches)).map((b) =>
      JSON.stringify(b.output),
    )
    const refused =
      outputs.join('').split(`at most ${FREEBUFF_PROJECTS_MAX_LIVE_SUBAGENTS}`)
        .length - 1
    expect(refused).toBe(asked - FREEBUFF_PROJECTS_MAX_LIVE_SUBAGENTS)
    expect(JSON.stringify((await other).output)).not.toContain('at most')
    // Every slot is released once its agent reports.
    expect(liveCappedAgentCountForTests()).toBe(0)
    const again = await spawn('root-a', 6)
    expect(JSON.stringify(again.output)).not.toContain('at most')
  })

  it(`runs at most ${MAX_LIVE_SUBAGENTS_PER_ROOT} subagents of any type at once under one root, nested ones included`, async () => {
    const gate = Promise.withResolvers<void>()
    const { notify, until } = waiters()
    let live = 0
    let peak = 0
    let nestedCalls = 0
    const refusals: string[] = []
    const templates = {
      mid: template('mid', ['leaf']),
      leaf: template('leaf'),
    }
    spyOn(runAgentStep, 'loopAgentSteps').mockImplementation(
      async (options) => {
        live++
        peak = Math.max(peak, live)
        if (options.agentType === 'mid') {
          nestedCalls++
          notify()
          // Each of the six spawns six more: 42 agents asked for.
          const nested = await spawnFrom(
            options.agentState,
            templates.mid,
            templates,
            'leaf',
            6,
            `nested-${options.agentState.agentId}`,
          )
          refusals.push(JSON.stringify(nested.output))
        } else {
          notify()
          await gate.promise
        }
        live--
        return {
          agentState: options.agentState,
          output: { type: 'lastMessage', value: [assistantMessage('done')] },
        }
      },
    )
    const state = getInitialSessionState(mockFileContext).mainAgentState
    state.runId = 'root-c'
    const top = spawnFrom(
      state,
      template('root', ['mid']),
      templates,
      'mid',
      6,
      'top',
    )
    await until(() => nestedCalls === 6 && live === MAX_LIVE_SUBAGENTS_PER_ROOT)
    await drainMicrotasks()
    expect(peak).toBe(MAX_LIVE_SUBAGENTS_PER_ROOT)
    gate.resolve()
    await top
    expect(peak).toBe(MAX_LIVE_SUBAGENTS_PER_ROOT)
    expect(refusalsIn(refusals, MAX_LIVE_SUBAGENTS_PER_ROOT, 'subagents')).toBe(
      6 + 36 - MAX_LIVE_SUBAGENTS_PER_ROOT,
    )
    expect(liveCappedAgentCountForTests()).toBe(0)
  })

  it("counts a Projects subagent's helpers in its own scope, apart from the root's shared count", async () => {
    const gate = Promise.withResolvers<void>()
    const { notify, until } = waiters()
    let helpers = 0
    let leaves = 0
    const helperOutputs: string[] = []
    const templates: Record<string, AgentTemplate> = {
      [FREEBUFF_PROJECTS_SUBAGENT_ID]: template(FREEBUFF_PROJECTS_SUBAGENT_ID, [
        'picker',
      ]),
      picker: template('picker', ['lister']),
      lister: template('lister'),
      leaf: template('leaf'),
    }
    const root = template('root', [FREEBUFF_PROJECTS_SUBAGENT_ID, 'leaf'])
    spyOn(runAgentStep, 'loopAgentSteps').mockImplementation(
      async (options) => {
        const type = options.agentType
        if (type === FREEBUFF_PROJECTS_SUBAGENT_ID || type === 'picker') {
          if (type === 'picker') helpers++
          notify()
          // A Projects subagent spawns six pickers; each picker one lister.
          const projects = type === FREEBUFF_PROJECTS_SUBAGENT_ID
          const nested = await spawnFrom(
            options.agentState,
            templates[type]!,
            templates,
            projects ? 'picker' : 'lister',
            projects ? 6 : 1,
            `from-${options.agentState.agentId}`,
          )
          helperOutputs.push(JSON.stringify(nested.output))
        } else {
          if (type === 'lister') helpers++
          else leaves++
          notify()
          await gate.promise
        }
        return {
          agentState: options.agentState,
          output: { type: 'lastMessage', value: [assistantMessage('done')] },
        }
      },
    )
    const state = getInitialSessionState(mockFileContext).mainAgentState
    state.runId = 'root-d'
    const first = spawnFrom(
      state,
      root,
      templates,
      FREEBUFF_PROJECTS_SUBAGENT_ID,
      1,
      'projects-1',
    )
    await until(() => helpers === 12)
    // Its twelve live helpers leave the root's whole shared count free.
    const leafBatches = Array.from({ length: 4 }, (_, i) =>
      spawnFrom(state, root, templates, 'leaf', 6, `leaves-${i}`),
    )
    await until(() => leaves === MAX_LIVE_SUBAGENTS_PER_ROOT)
    await drainMicrotasks()
    // With the shared count full, another Projects subagent's helpers still run.
    const second = spawnFrom(
      state,
      root,
      templates,
      FREEBUFF_PROJECTS_SUBAGENT_ID,
      1,
      'projects-2',
    )
    await until(() => helpers === 24)
    gate.resolve()
    const leafOutputs = (await Promise.all(leafBatches)).map((b) =>
      JSON.stringify(b.output),
    )
    expect(
      refusalsIn(leafOutputs, MAX_LIVE_SUBAGENTS_PER_ROOT, 'subagents'),
    ).toBe(24 - MAX_LIVE_SUBAGENTS_PER_ROOT)
    const projectsOutputs = (await Promise.all([first, second])).map((b) =>
      JSON.stringify(b.output),
    )
    expect(helperOutputs).toHaveLength(2 + 12)
    expect([...helperOutputs, ...projectsOutputs].join('')).not.toContain(
      'at most',
    )
    expect(leaves).toBe(MAX_LIVE_SUBAGENTS_PER_ROOT)
    expect(liveCappedAgentCountForTests()).toBe(0)
  })

  it('holds a Projects subagent spelled with underscores to the Projects cap too', async () => {
    const gate = Promise.withResolvers<void>()
    let started = 0
    spyOn(runAgentStep, 'loopAgentSteps').mockImplementation(
      async (options) => {
        started++
        await gate.promise
        return {
          agentState: options.agentState,
          output: { type: 'lastMessage', value: [assistantMessage('done')] },
        }
      },
    )
    const root = template('root', [FREEBUFF_PROJECTS_SUBAGENT_ID])
    const templates = {
      [FREEBUFF_PROJECTS_SUBAGENT_ID]: template(FREEBUFF_PROJECTS_SUBAGENT_ID),
    }
    const state = getInitialSessionState(mockFileContext).mainAgentState
    state.runId = 'root-underscore'
    // Fill the Projects count with the plain spelling, then ask for more with underscores.
    const plain = [6, 6, 6, 2].map((n, i) =>
      spawnFrom(
        state,
        root,
        templates,
        FREEBUFF_PROJECTS_SUBAGENT_ID,
        n,
        `plain-${i}`,
      ),
    )
    await drainMicrotasks()
    expect(started).toBe(FREEBUFF_PROJECTS_MAX_LIVE_SUBAGENTS)
    const underscored = spawnFrom(
      state,
      root,
      templates,
      FREEBUFF_PROJECTS_SUBAGENT_ID.replace(/-/g, '_'),
      6,
      'underscore',
    )
    await drainMicrotasks()
    expect(started).toBe(FREEBUFF_PROJECTS_MAX_LIVE_SUBAGENTS)
    gate.resolve()
    await Promise.all(plain)
    const refused = JSON.stringify((await underscored).output)
    expect(
      refused.split(`at most ${FREEBUFF_PROJECTS_MAX_LIVE_SUBAGENTS}`).length -
        1,
    ).toBe(6)
    expect(liveCappedAgentCountForTests()).toBe(0)
  })
})
