import { describe, expect, it } from 'bun:test'

import { buildSpawnAgentsInputForDirectAgentCall } from '../direct-agent-tool-repair'

describe('direct agent tool repair', () => {
  it('preserves prompt, explicit params, and handoff without double nesting', () => {
    const input = buildSpawnAgentsInputForDirectAgentCall({
      agentType: 'basher',
      input: JSON.stringify({
        prompt: 'Run the focused tests',
        params: JSON.stringify({ command: 'bun test' }),
        handoff: JSON.stringify({ schemaVersion: 1, taskId: 'validate' }),
      }),
    })

    expect(input).toEqual({
      agents: [
        {
          agent_type: 'basher',
          prompt: 'Run the focused tests',
          params: { command: 'bun test' },
          handoff: { schemaVersion: 1, taskId: 'validate' },
        },
      ],
    })
  })

  it('wraps legacy top-level agent fields only when params is absent', () => {
    expect(
      buildSpawnAgentsInputForDirectAgentCall({
        agentType: 'basher',
        input: { command: 'bun test', what_to_summarize: 'failures' },
      }),
    ).toEqual({
      agents: [
        {
          agent_type: 'basher',
          params: {
            command: 'bun test',
            what_to_summarize: 'failures',
          },
        },
      ],
    })
  })

  it('does not merge legacy top-level fields into explicit params', () => {
    expect(
      buildSpawnAgentsInputForDirectAgentCall({
        agentType: 'basher',
        input: { params: { command: 'bun test' }, command: 'wrong command' },
      }),
    ).toEqual({
      agents: [
        {
          agent_type: 'basher',
          params: { command: 'bun test' },
        },
      ],
    })
  })

  it('preserves background controls and nested JSON-looking string params', () => {
    expect(
      buildSpawnAgentsInputForDirectAgentCall({
        agentType: 'basher',
        input: {
          prompt: 'Run the command',
          background: true,
          timeout_seconds: 90,
          params: JSON.stringify({
            command: '["literal-shell-token"]',
            what_to_summarize: '{"keep":"as text"}',
          }),
        },
      }),
    ).toEqual({
      agents: [
        {
          agent_type: 'basher',
          prompt: 'Run the command',
          background: true,
          timeout_seconds: 90,
          params: {
            command: '["literal-shell-token"]',
            what_to_summarize: '{"keep":"as text"}',
          },
        },
      ],
    })
  })

  it('returns undefined for malformed or non-object input instead of fabricating empty params', () => {
    expect(
      buildSpawnAgentsInputForDirectAgentCall({
        agentType: 'basher',
        input: '{"params":{"command":"bun test"}',
      }),
    ).toBeUndefined()
    expect(
      buildSpawnAgentsInputForDirectAgentCall({
        agentType: 'basher',
        input: '[]',
      }),
    ).toBeUndefined()
  })

  it('repairs malformed outer and nested separators', () => {
    expect(
      buildSpawnAgentsInputForDirectAgentCall({
        agentType: 'basher',
        input:
          '{"prompt":"Run tests",,"params":"{\\"command\\":\\"bun test\\",,\\"timeout_seconds\\":30}"}',
      }),
    ).toEqual({
      agents: [
        {
          agent_type: 'basher',
          prompt: 'Run tests',
          params: { command: 'bun test', timeout_seconds: 30 },
        },
      ],
    })
  })
})
