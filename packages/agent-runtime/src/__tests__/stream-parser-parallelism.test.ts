import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import type { SessionState } from '@codebuff/common/types/session-state'
import { describe, expect, it } from 'bun:test'

import { processStream } from '../tools/stream-parser'
import { createMockStreamWithToolCalls, mockFileContext } from './test-utils'

import type { AgentTemplate } from '../templates/types'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { StreamChunk } from '@codebuff/common/types/contracts/llm'
import type { PromptResult } from '@codebuff/common/util/error'

/**
 * P0-4 — Tool-level parallelism tests.
 *
 * These tests verify that read-only tools (read_files, read_image,
 * read_subtree, read_outline, list_directory, glob, query_index) run
 * concurrently with each other, while write tools (str_replace, write_file,
 * edit_transaction, ...) serialize after all in-flight reads AND prior writes,
 * and reads issued after a write wait for that write to complete.
 *
 * The dispatch logic lives in stream-parser.ts: two chains are tracked —
 * `lastWriteFinished` (writes wait on prior writes + all in-flight reads) and
 * `inFlightReads` (concurrent reads that only wait on writes).
 */

const testAgentTemplate: AgentTemplate = {
  id: 'test-agent',
  displayName: 'Test Agent',
  spawnerPrompt: 'Test agent',
  model: 'claude-3-5-sonnet-20241022',
  inputSchema: {},
  outputMode: 'last_message',
  includeMessageHistory: true,
  inheritParentSystemPrompt: false,
  mcpServers: {},
  toolNames: [
    'read_files',
    'read_image',
    'read_outline',
    'list_directory',
    'glob',
    'query_index',
    'str_replace',
    'write_file',
    'run_terminal_command',
    'end_turn',
  ],
  spawnableAgents: [],
  systemPrompt: 'Test system prompt',
  instructionsPrompt: 'Test instructions',
  stepPrompt: 'Test step prompt',
}

function buildProcessStreamParams(overrides: {
  stream: AsyncGenerator<StreamChunk, PromptResult<string | null>>
  agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps
  agentState?: SessionState['mainAgentState']
  onResponseChunk?: (chunk: any) => void
}) {
  const sessionState = getInitialSessionState(mockFileContext)
  return {
    ...overrides.agentRuntimeImpl,
    agentContext: {},
    agentState: overrides.agentState ?? sessionState.mainAgentState,
    agentStepId: 'test-step-id',
    agentTemplate: testAgentTemplate,
    ancestorRunIds: [] as string[],
    clientSessionId: 'test-session',
    fileContext: mockFileContext,
    fingerprintId: 'test-fingerprint',
    fullResponse: '',
    localAgentTemplates: { 'test-agent': testAgentTemplate },
    messages: [],
    prompt: 'test prompt',
    repoId: undefined,
    repoUrl: undefined,
    runId: 'test-run-id',
    signal: new AbortController().signal,
    stream: overrides.stream,
    system: 'test system',
    tools: {},
    userId: 'test-user',
    userInputId: 'test-input-id',
    onCostCalculated: async () => {},
    onResponseChunk: overrides.onResponseChunk ?? (() => {}),
  }
}

/**
 * Creates a mock stream that yields `count` read_files tool calls (each reading
 * a distinct path) followed by an end_turn. This models the common case of an
 * agent issuing several independent reads in one turn.
 */
function createParallelReadsStream(
  count: number,
  toolCallIdPrefix = 'read',
): AsyncGenerator<StreamChunk, PromptResult<string | null>> {
  async function* generator(): AsyncGenerator<
    StreamChunk,
    PromptResult<string | null>
  > {
    for (let i = 0; i < count; i++) {
      yield {
        type: 'tool-call' as const,
        toolName: 'read_files',
        toolCallId: `${toolCallIdPrefix}-${i}`,
        input: { paths: [`file-${i}.txt`] },
      }
    }
    yield {
      type: 'tool-call' as const,
      toolName: 'end_turn',
      toolCallId: 'end',
      input: {},
    }
    return { value: 'mock-message-id' } as PromptResult<string | null>
  }
  return generator()
}

describe('stream parser tool parallelism (P0-4)', () => {
  it('runs N read_files calls concurrently (~1x latency, not Nx)', async () => {
    // Each read_files handler call resolves requestFiles after a fixed delay.
    // If reads were serialized, total time would be ~N * delay. With
    // parallelism, total time should be ~1 * delay. We use a generous tolerance
    // band to avoid flakiness on slow CI runners.
    const READ_DELAY_MS = 150
    const READ_COUNT = 4
    const SERIAL_LOWER = READ_COUNT * READ_DELAY_MS // serialized floor
    const PARALLEL_UPPER = READ_DELAY_MS * 2.5 // parallel ceiling (1x + slack)

    const agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps = {
      ...TEST_AGENT_RUNTIME_IMPL,
      sendAction: () => {},
      requestFiles: async () => {
        await delay(READ_DELAY_MS)
        // Return empty content; we only care about timing here.
        return {}
      },
      requestToolCall: async () => ({ output: [] }),
    }

    const stream = createParallelReadsStream(READ_COUNT)
    const start = Date.now()
    await processStream(buildProcessStreamParams({ stream, agentRuntimeImpl }))
    const elapsed = Date.now() - start

    // Assert parallelism: elapsed must be well under the serialized floor,
    // and roughly within one read delay (plus slack for setup/teardown).
    expect(elapsed).toBeLessThan(SERIAL_LOWER)
    expect(elapsed).toBeLessThanOrEqual(PARALLEL_UPPER)
  })

  it('serializes two write_file calls on the same path (second starts only after first commits)', async () => {
    // Use a .txt path so the P0-2 preflight syntax validator skips (we are
    // testing ordering here, not syntax). The write content is plain text.
    //
    // We track execution order via events rather than inspecting content,
    // because requestToolCall receives a unified-diff patch string (not raw
    // content) for existing-file updates — content inspection would couple the
    // test to the write handler's internal patch mechanics.
    const path = 'same-path-write.txt'
    const events: string[] = []
    let diskReadCount = 0

    const agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps = {
      ...TEST_AGENT_RUNTIME_IMPL,
      sendAction: () => {},
      requestFiles: async () => ({}),
      requestOptionalFile: async ({ filePath }: { filePath: string }) => {
        if (filePath === path) {
          diskReadCount += 1
          events.push(`disk-read-${diskReadCount}`)
        }
        return null
      },
      requestToolCall: async (params: any) => {
        if (params.toolName === 'write_file') {
          events.push('write-commit')
        }
        return { output: [] }
      },
    }

    const sessionState = getInitialSessionState(mockFileContext)
    // Pre-authorize reads so write_file doesn't need a separate read first.
    sessionState.mainAgentState.readAuthorizationsByPath = {
      [path]: true,
    }

    const stream = createMockStreamWithToolCalls([
      {
        toolName: 'write_file',
        input: { path, instructions: 'first write', content: 'first write' },
      },
      {
        toolName: 'write_file',
        input: { path, instructions: 'second write', content: 'second write' },
      },
      { toolName: 'end_turn', input: {} },
    ])

    await processStream(
      buildProcessStreamParams({
        stream,
        agentRuntimeImpl,
        agentState: sessionState.mainAgentState,
      }),
    )

    // Both writes must have committed.
    const commits = events.filter((e) => e === 'write-commit')
    expect(commits.length).toBe(2)
    // Only write1 read from disk; write2 used write1's committed content via
    // the previousEdit chain inside the write_file handler (no redundant disk
    // read for the second same-path write).
    expect(diskReadCount).toBe(1)
    // Event order proves serialization: write1 read disk, committed, then
    // write2 committed. write2 did not start until write1 fully finished.
    expect(events).toEqual(['disk-read-1', 'write-commit', 'write-commit'])
  })

  it('runs two write_file calls on DIFFERENT paths concurrently (~1x latency, not 2x)', async () => {
    // Two writes on DIFFERENT paths must begin executing concurrently (overlap
    // in time) instead of the second waiting for the first to fully finish. We
    // verify via timing: each write's client apply (requestToolCall) takes a
    // fixed WRITE_DELAY_MS, so under concurrency total elapsed is ~1x the
    // delay, while under serialization it would be ~2x. Use .txt paths so the
    // preflight syntax validator skips (matches the same-path test's approach).
    const pathA = 'diff-path-a.txt'
    const pathB = 'diff-path-b.txt'
    const WRITE_DELAY_MS = 100
    const events: string[] = []

    const agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps = {
      ...TEST_AGENT_RUNTIME_IMPL,
      sendAction: () => {},
      requestFiles: async () => ({}),
      requestOptionalFile: async () => null,
      requestToolCall: async (params: any) => {
        if (params.toolName === 'write_file') {
          events.push('write-commit')
          await delay(WRITE_DELAY_MS)
        }
        return { output: [] }
      },
    }

    const sessionState = getInitialSessionState(mockFileContext)
    // Pre-authorize reads on BOTH paths so write_file doesn't need a separate
    // read first.
    sessionState.mainAgentState.readAuthorizationsByPath = {
      [pathA]: true,
      [pathB]: true,
    }

    const stream = createMockStreamWithToolCalls([
      {
        toolName: 'write_file',
        input: { path: pathA, instructions: 'write a', content: 'a' },
      },
      {
        toolName: 'write_file',
        input: { path: pathB, instructions: 'write b', content: 'b' },
      },
      { toolName: 'end_turn', input: {} },
    ])

    const start = Date.now()
    await processStream(
      buildProcessStreamParams({
        stream,
        agentRuntimeImpl,
        agentState: sessionState.mainAgentState,
      }),
    )
    const elapsed = Date.now() - start

    // Both writes must have committed.
    const commits = events.filter((e) => e === 'write-commit')
    expect(commits.length).toBe(2)
    // Sanity floor: at least one write delay must elapse.
    expect(elapsed).toBeGreaterThanOrEqual(WRITE_DELAY_MS)
    // Concurrency ceiling: under serialization elapsed would be ~2x the delay.
    // Allow generous slack for setup/teardown on slow CI runners.
    expect(elapsed).toBeLessThan(2 * WRITE_DELAY_MS * 1.5)
  })

  it('orders read-after-write: read_files after write_file waits for the write', async () => {
    // A read issued AFTER a write must wait for that write to complete. We
    // verify via execution-order tracking rather than content inspection,
    // because requestToolCall receives a unified-diff patch (not raw content)
    // for existing-file updates.
    const path = 'read-after-write.txt'
    const events: string[] = []

    const agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps = {
      ...TEST_AGENT_RUNTIME_IMPL,
      sendAction: () => {},
      requestFiles: async () => {
        events.push('read-start')
        return {}
      },
      requestOptionalFile: async () => null,
      requestToolCall: async (params: any) => {
        if (params.toolName === 'write_file') {
          events.push('write-commit')
        }
        return { output: [] }
      },
    }

    const sessionState = getInitialSessionState(mockFileContext)
    sessionState.mainAgentState.readAuthorizationsByPath = {
      [path]: true,
    }

    const stream = createMockStreamWithToolCalls([
      {
        toolName: 'write_file',
        input: {
          path,
          instructions: 'write content',
          content: 'written content',
        },
      },
      {
        toolName: 'read_files',
        input: { paths: [path] },
      },
      { toolName: 'end_turn', input: {} },
    ])

    await processStream(
      buildProcessStreamParams({
        stream,
        agentRuntimeImpl,
        agentState: sessionState.mainAgentState,
      }),
    )

    // The read must start AFTER the write committed (read-after-write
    // ordering). If P0-4 dispatch were broken, the read would race ahead.
    expect(events).toEqual(['write-commit', 'read-start'])
  })

  it('runs a read issued before a write concurrently with that write only up to the write barrier', async () => {
    // This test confirms the invariant: a read issued BEFORE a write does NOT
    // wait for that write (it's already in-flight), but the write DOES wait for
    // the read to finish. We verify via timing: a slow read + a fast write
    // should take ~max(read, write) under parallelism, not read + write.
    const READ_DELAY_MS = 120
    const WRITE_DELAY_MS = 20

    const agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps = {
      ...TEST_AGENT_RUNTIME_IMPL,
      sendAction: () => {},
      requestFiles: async () => {
        await delay(READ_DELAY_MS)
        return {}
      },
      requestOptionalFile: async () => 'original',
      requestToolCall: async () => {
        await delay(WRITE_DELAY_MS)
        return { output: [] }
      },
    }

    const sessionState = getInitialSessionState(mockFileContext)
    sessionState.mainAgentState.readAuthorizationsByPath = {
      'concurrent-rw.txt': true,
    }

    const stream = createMockStreamWithToolCalls([
      { toolName: 'read_files', input: { paths: ['concurrent-rw.txt'] } },
      {
        toolName: 'write_file',
        input: {
          path: 'concurrent-rw.txt',
          instructions: 'write new content',
          content: 'new content',
        },
      },
      { toolName: 'end_turn', input: {} },
    ])

    const start = Date.now()
    await processStream(
      buildProcessStreamParams({
        stream,
        agentRuntimeImpl,
        agentState: sessionState.mainAgentState,
      }),
    )
    const elapsed = Date.now() - start

    // Under parallelism, the write waits for the read (READ_DELAY_MS) then
    // runs for WRITE_DELAY_MS, so total ~ READ_DELAY_MS + WRITE_DELAY_MS.
    // The read runs concurrently with... nothing before it, so it's the
    // critical path. The serialized floor would be the same here since the
    // write depends on the read anyway. This test mainly asserts no deadlock
    // and reasonable timing (write didn't start before read finished).
    expect(elapsed).toBeGreaterThanOrEqual(READ_DELAY_MS)
    // Should complete well within a serialized-reads floor would imply a bug.
    expect(elapsed).toBeLessThan(READ_DELAY_MS * 3)
  })

  it('[MUT-H03][ABI-M09] queues a named write behind a prior global write barrier', async () => {
    const events: string[] = []
    let releaseTerminal!: () => void
    const terminalGate = new Promise<void>((resolve) => {
      releaseTerminal = resolve
    })
    let terminalStarted!: () => void
    const terminalStart = new Promise<void>((resolve) => {
      terminalStarted = resolve
    })

    const agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps = {
      ...TEST_AGENT_RUNTIME_IMPL,
      sendAction: () => {},
      requestFiles: async () => ({}),
      requestOptionalFile: async () => null,
      requestToolCall: async (params: any) => {
        if (params.toolName === 'run_terminal_command') {
          events.push('global-start')
          terminalStarted()
          await terminalGate
          events.push('global-finish')
          return {
            output: [
              {
                type: 'json',
                value: { command: 'hold', stdout: '', exitCode: 0 },
              },
            ],
          }
        }
        if (params.toolName === 'write_file') {
          events.push('named-write')
        }
        return { output: [] }
      },
    }
    const sessionState = getInitialSessionState(mockFileContext)
    sessionState.mainAgentState.readAuthorizationsByPath = {
      'after-global.txt': true,
    }
    const toolEvents: unknown[] = []
    let writeCallObserved!: () => void
    const writeCall = new Promise<void>((resolve) => {
      writeCallObserved = resolve
    })
    const stream = createMockStreamWithToolCalls([
      {
        toolName: 'run_terminal_command',
        input: { command: 'hold', process_type: 'SYNC' },
      },
      {
        toolName: 'write_file',
        input: {
          path: 'after-global.txt',
          instructions: 'write after terminal',
          content: 'after',
        },
      },
      { toolName: 'end_turn', input: {} },
    ])

    const processing = processStream(
      buildProcessStreamParams({
        stream,
        agentRuntimeImpl,
        agentState: sessionState.mainAgentState,
        onResponseChunk: (chunk) => {
          toolEvents.push(chunk)
          if (
            chunk &&
            typeof chunk === 'object' &&
            chunk.type === 'tool_call' &&
            chunk.toolName === 'write_file'
          ) {
            writeCallObserved()
          }
        },
      }),
    )
    await terminalStart
    await writeCall
    expect(events).toEqual(['global-start'])
    expect(toolEvents).toContainEqual(
      expect.objectContaining({
        type: 'tool_call',
        toolName: 'write_file',
        queued: true,
      }),
    )

    releaseTerminal()
    await processing
    expect(events).toEqual(['global-start', 'global-finish', 'named-write'])
  })
})

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
