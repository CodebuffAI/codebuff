import { afterEach, describe, expect, mock, test } from 'bun:test'

import { COMPOSIO_META_TOOL_NAMES } from '@codebuff/common/constants/composio'
import { clientToolNames, toolParams } from '@codebuff/common/tools/list'

import { executeComposioToolViaServer } from '../composio'

describe('Composio SDK tools', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('registers Composio meta tools as static client tools without discovery fetch', () => {
    const fetchMock = mock(async () => new Response('{}'))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    for (const toolName of COMPOSIO_META_TOOL_NAMES) {
      expect(clientToolNames).toContain(toolName)
      expect(toolParams[toolName].inputSchema).toBeDefined()
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('executes a meta tool through the server execute endpoint', async () => {
    const fetchMock = mock(
      async (_url: string | URL | Request, init?: RequestInit) => {
        expect(init?.method).toBe('POST')
        expect(init?.headers).toEqual({
          Authorization: 'Bearer codebuff-api-key',
          'Content-Type': 'application/json',
        })
        expect(JSON.parse(String(init?.body))).toEqual({
          toolName: 'composio_search_tools',
          input: {
            queries: ['find gmail tools'],
            session: { generate_id: true },
          },
        })
        return new Response(
          JSON.stringify({
            output: [{ type: 'json', value: { ok: true } }],
          }),
          { status: 200 },
        )
      },
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const output = await executeComposioToolViaServer({
      apiKey: 'codebuff-api-key',
      toolName: 'composio_search_tools',
      input: {
        queries: ['find gmail tools'],
        session: { generate_id: true },
      },
    })

    expect(output).toEqual([{ type: 'json', value: { ok: true } }])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('returns a tool error when the server response is malformed', async () => {
    globalThis.fetch = mock(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ) as unknown as typeof fetch

    const output = await executeComposioToolViaServer({
      apiKey: 'codebuff-api-key',
      toolName: 'composio_search_tools',
      input: {
        queries: ['find gmail tools'],
        session: { generate_id: true },
      },
    })

    expect(output).toEqual([
      {
        type: 'json',
        value: {
          errorMessage: 'Invalid Composio execute response from server',
        },
      },
    ])
  })
})
