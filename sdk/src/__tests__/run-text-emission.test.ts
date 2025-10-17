import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test'

import {
  clearMockedModules,
  mockModule,
} from '../../../common/src/testing/mock-modules'
import {
  getInitialAgentState,
  getInitialSessionState,
} from '../../../common/src/types/session-state'
import { getStubProjectFileContext } from '../../../common/src/util/file'

import type { PrintModeEvent } from '../../../common/src/types/print-mode'
import type { ClientAction, ServerAction } from '../../../common/src/actions'

type MockHandlerInstance = {
  options: {
    onResponseChunk: (action: ServerAction<'response-chunk'>) => Promise<void>
    onPromptResponse: (
      action: ServerAction<'prompt-response'>,
    ) => Promise<void>
  }
  lastInput?: ClientAction<'prompt'>
}

const handlerState: { instances: MockHandlerInstance[] } = {
  instances: [],
}

const createSessionState = () => {
  const sessionState = getInitialSessionState(getStubProjectFileContext())
  sessionState.mainAgentState = {
    ...getInitialAgentState(),
    agentType: 'base',
  }
  return sessionState
}

let run: typeof import('../run').run

beforeAll(async () => {
  await mockModule('../../../sdk/src/websocket-client', () => {
    class MockWebSocketHandler {
      options: MockHandlerInstance['options']
      lastInput?: ClientAction<'prompt'>

      constructor(options: MockHandlerInstance['options']) {
        this.options = options
        handlerState.instances.push(this)
      }

      async connect(): Promise<void> {}

      reconnect(): void {}

      close(): void {}

      getConnectionStatus(): boolean {
        return true
      }

      getReadyState(): number {
        return 1
      }

      sendInput(input: ClientAction<'prompt'>): void {
        this.lastInput = input
      }

      cancelInput(): void {}
    }

    return {
      WebSocketHandler: MockWebSocketHandler,
    }
  })

  await mockModule('../../../sdk/src/run-state', () => ({
    initialSessionState: async () => createSessionState(),
    applyOverridesToSessionState: async () => createSessionState(),
  }))

  ;({ run } = await import('../run'))
})

afterAll(() => {
  clearMockedModules()
})

beforeEach(() => {
  handlerState.instances.splice(0, handlerState.instances.length)
})

const waitForHandler = async (): Promise<MockHandlerInstance> => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const handler = handlerState.instances.at(-1)
    if (handler) {
      return handler
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('Mock WebSocketHandler was not instantiated')
}

const resolvePrompt = async (
  handler: MockHandlerInstance,
  extras: Partial<ClientAction<'prompt'>> = {},
) => {
  const promptId =
    handler.lastInput?.promptId ??
    (typeof crypto !== 'undefined'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2))

  await handler.options.onPromptResponse({
    type: 'prompt-response',
    promptId,
    sessionState: createSessionState(),
    toolCalls: [],
    toolResults: [],
    output: {
      type: 'lastMessage',
      value: null,
    },
    ...extras,
  })
}

const responseChunk = (
  handler: MockHandlerInstance,
  chunk: ServerAction<'response-chunk'>['chunk'],
): ServerAction<'response-chunk'> => ({
  type: 'response-chunk',
  userInputId: handler.lastInput?.promptId ?? 'prompt',
  chunk,
})

describe('run() text emission', () => {
  const baseRunOptions = {
    apiKey: 'test-key',
    fingerprintId: 'fp-123',
    agent: 'base',
    prompt: 'Hello',
    cwd: process.cwd(),
  } as const

  test('emits full root section when string chunks flush on finish', async () => {
    const events: PrintModeEvent[] = []
    const runPromise = run({
      ...baseRunOptions,
      handleEvent: (event) => {
        events.push(event)
      },
    })

    const handler = await waitForHandler()

    await handler.options.onResponseChunk(
      responseChunk(handler, 'Bootstrapping '),
    )
    await handler.options.onResponseChunk(
      responseChunk(handler, 'stream output\nNext line.'),
    )
    await handler.options.onResponseChunk(
      responseChunk(handler, {
        type: 'finish',
        totalCost: 0,
      }),
    )

    await resolvePrompt(handler)
    await runPromise

    const textEvents = events.filter(
      (event): event is PrintModeEvent & { type: 'text' } =>
        event.type === 'text',
    )
    expect(textEvents).toHaveLength(1)
    expect(textEvents[0]).toMatchObject({
      type: 'text',
      text: 'Bootstrapping stream output\nNext line.',
    })
  })

  test('splits root sections around tool events without duplication', async () => {
    const events: PrintModeEvent[] = []
    const runPromise = run({
      ...baseRunOptions,
      handleEvent: async (event) => {
        events.push(event)
      },
    })

    const handler = await waitForHandler()

    await handler.options.onResponseChunk(
      responseChunk(handler, {
        type: 'text',
        text: 'First section',
      }),
    )
    await handler.options.onResponseChunk(
      responseChunk(handler, {
        type: 'tool_call',
        toolCallId: 'tool-1',
        toolName: 'example_tool',
        input: {},
      }),
    )
    await handler.options.onResponseChunk(
      responseChunk(handler, {
        type: 'text',
        text: 'Second section',
      }),
    )
    await handler.options.onResponseChunk(
      responseChunk(handler, {
        type: 'finish',
        totalCost: 0,
      }),
    )

    await resolvePrompt(handler)
    await runPromise

    const textEvents = events.filter(
      (event): event is PrintModeEvent & { type: 'text' } =>
        event.type === 'text',
    )
    expect(textEvents).toEqual([
      expect.objectContaining({ type: 'text', text: 'First section' }),
      expect.objectContaining({ type: 'text', text: 'Second section' }),
    ])
  })

  test('preserves agent identifiers when emitting sections', async () => {
    const events: PrintModeEvent[] = []
    const runPromise = run({
      ...baseRunOptions,
      handleEvent: (event) => {
        events.push(event)
      },
    })

    const handler = await waitForHandler()

    await handler.options.onResponseChunk(
      responseChunk(handler, {
        type: 'text',
        agentId: 'agent-1',
        text: 'Agent text content',
      }),
    )
    await handler.options.onResponseChunk(
      responseChunk(handler, {
        type: 'subagent_finish',
        agentId: 'agent-1',
        agentType: 'helper',
        displayName: 'Helper',
        onlyChild: false,
      }),
    )
    await handler.options.onResponseChunk(
      responseChunk(handler, {
        type: 'finish',
        totalCost: 0,
      }),
    )

    await resolvePrompt(handler)
    await runPromise

    const textEvents = events.filter(
      (event): event is PrintModeEvent & { type: 'text' } =>
        event.type === 'text',
    )

    expect(textEvents).toContainEqual(
      expect.objectContaining({
        type: 'text',
        agentId: 'agent-1',
        text: 'Agent text content',
      }),
    )
  })

  test('filters tool XML payloads while emitting surrounding text', async () => {
    const events: PrintModeEvent[] = []
    const runPromise = run({
      ...baseRunOptions,
      handleEvent: (event) => {
        events.push(event)
      },
    })

    const handler = await waitForHandler()

    await handler.options.onResponseChunk(
      responseChunk(handler, {
        type: 'text',
        text: 'Before <codebuff_tool_call>{"a":1}',
      }),
    )
    await handler.options.onResponseChunk(
      responseChunk(handler, {
        type: 'text',
        text: '</codebuff_tool_call>',
      }),
    )
    await handler.options.onResponseChunk(
      responseChunk(handler, {
        type: 'text',
        text: ' after',
      }),
    )
    await handler.options.onResponseChunk(
      responseChunk(handler, {
        type: 'finish',
        totalCost: 0,
      }),
    )

    await resolvePrompt(handler)
    await runPromise

    const textEvents = events.filter(
      (event): event is PrintModeEvent & { type: 'text' } =>
        event.type === 'text',
    )

    expect(textEvents.map((event) => event.text)).toEqual([
      'Before ',
      ' after',
    ])
  })
})
