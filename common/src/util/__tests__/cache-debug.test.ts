import { describe, expect, test, mock } from 'bun:test'

import {
  parseCacheDebugCorrelation,
  serializeCacheDebugCorrelation,
  normalizeProviderRequestBodyForCacheDebug,
} from '../cache-debug'

describe('serializeCacheDebugCorrelation', () => {
  test('round-trips a correlation through JSON', () => {
    const correlation = {
      projectRoot: '/home/user/project',
      filename: '001-agent-abc.json',
      snapshotId: 'snap-123',
    }
    const serialized = serializeCacheDebugCorrelation(correlation)
    expect(serialized).toBe(JSON.stringify(correlation))

    const parsed = parseCacheDebugCorrelation(serialized)
    expect(parsed).toEqual(correlation)
  })
})

describe('parseCacheDebugCorrelation', () => {
  test('returns undefined for non-string input', () => {
    expect(parseCacheDebugCorrelation(undefined)).toBeUndefined()
    expect(parseCacheDebugCorrelation(null)).toBeUndefined()
    expect(parseCacheDebugCorrelation(42)).toBeUndefined()
  })

  test('returns undefined for non-JSON string', () => {
    expect(parseCacheDebugCorrelation('not json {')).toBeUndefined()
  })

  test('returns undefined when required fields are missing', () => {
    expect(
      parseCacheDebugCorrelation(JSON.stringify({ projectRoot: '/x' })),
    ).toBeUndefined()
    expect(
      parseCacheDebugCorrelation(
        JSON.stringify({ projectRoot: '/x', filename: 'f.json' }),
      ),
    ).toBeUndefined()
  })

  test('returns undefined when fields have wrong types', () => {
    expect(
      parseCacheDebugCorrelation(
        JSON.stringify({ projectRoot: 123, filename: 'f', snapshotId: 's' }),
      ),
    ).toBeUndefined()
  })

  test('preserves exactly the three required fields', () => {
    const serialized = serializeCacheDebugCorrelation({
      projectRoot: '/p',
      filename: 'f.json',
      snapshotId: 's1',
    })
    // Extra fields in the JSON should be dropped by the parser.
    const withExtra = serialized.replace(
      '}',
      ',"extra":"ignored","another":42}',
    )
    const parsed = parseCacheDebugCorrelation(withExtra)
    expect(parsed).toEqual({
      projectRoot: '/p',
      filename: 'f.json',
      snapshotId: 's1',
    })
  })
})

describe('normalizeProviderRequestBodyForCacheDebug', () => {
  test('passes through primitive bodies unchanged', () => {
    expect(
      normalizeProviderRequestBodyForCacheDebug({ provider: 'x', body: 42 }),
    ).toBe(42)
    expect(
      normalizeProviderRequestBodyForCacheDebug({ provider: 'x', body: 'hi' }),
    ).toBe('hi')
    expect(
      normalizeProviderRequestBodyForCacheDebug({ provider: 'x', body: null }),
    ).toBe(null)
  })

  test('deep-normalizes array bodies (new instance, same contents)', () => {
    const arr = [1, 2, 3]
    const out = normalizeProviderRequestBodyForCacheDebug({
      provider: 'x',
      body: arr,
    })
    expect(out).toEqual([1, 2, 3])
    // normalizeForJson always returns a fresh container.
    expect(out).not.toBe(arr)
  })

  test('parses a JSON string body into an object', () => {
    const body = JSON.stringify({ model: 'gpt-4', messages: [] })
    const out = normalizeProviderRequestBodyForCacheDebug({
      provider: 'x',
      body,
    })
    expect(out).toEqual({ model: 'gpt-4', messages: [] })
  })

  test('falls back to the raw string when JSON.parse fails', () => {
    const consoleDebug = mock(() => {})
    const original = console.debug
    console.debug = consoleDebug
    try {
      const out = normalizeProviderRequestBodyForCacheDebug({
        provider: 'x',
        body: 'not json',
      })
      expect(out).toBe('not json')
      expect(consoleDebug).toHaveBeenCalledTimes(1)
    } finally {
      console.debug = original
    }
  })

  test('selects only the known top-level keys for a generic provider', () => {
    const body = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ type: 'function', name: 'foo' }],
      tool_choice: 'auto',
      response_format: { type: 'json_object' },
      reasoning: { effort: 'high' },
      reasoning_effort: 'high',
      verbosity: 5,
      provider: 'openai',
      // Unknown keys should be dropped.
      unknown_key: 'dropped',
      temperature: 0.7,
    }
    const out = normalizeProviderRequestBodyForCacheDebug({
      provider: 'x',
      body,
    }) as Record<string, unknown>
    expect(Object.keys(out).sort()).toEqual(
      [
        'model',
        'messages',
        'tools',
        'tool_choice',
        'response_format',
        'reasoning',
        'reasoning_effort',
        'verbosity',
        'provider',
      ].sort(),
    )
  })

  test('includes openrouter-specific keys only for the openrouter provider', () => {
    const body = {
      model: 'm',
      models: ['m1'],
      plugins: [{ id: 'web' }],
      web_search_options: { enabled: true },
      include_reasoning: true,
      reasoning: { effort: 'high' },
    }
    const openrouterOut = normalizeProviderRequestBodyForCacheDebug({
      provider: 'openrouter',
      body,
    }) as Record<string, unknown>
    expect(openrouterOut['models']).toEqual(['m1'])
    expect(openrouterOut['plugins']).toEqual([{ id: 'web' }])
    expect(openrouterOut['web_search_options']).toEqual({ enabled: true })
    expect(openrouterOut['include_reasoning']).toBe(true)

    const genericOut = normalizeProviderRequestBodyForCacheDebug({
      provider: 'anthropic',
      body,
    }) as Record<string, unknown>
    // generic provider should NOT include the openrouter-specific keys.
    expect(genericOut['models']).toBeUndefined()
    expect(genericOut['plugins']).toBeUndefined()
    expect(genericOut['web_search_options']).toBeUndefined()
    expect(genericOut['include_reasoning']).toBeUndefined()
  })

  test('summarizes data-URL strings in messages', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=' + 'A'.repeat(100)
    const body = { messages: [{ role: 'user', content: dataUrl }] }
    const out = normalizeProviderRequestBodyForCacheDebug({
      provider: 'x',
      body,
    }) as Record<string, unknown>
    const messages = out['messages'] as Array<{ content: unknown }>
    const summarized = messages[0].content as Record<string, unknown>
    expect(summarized['type']).toBe('data-url')
    expect(summarized['mediaType']).toBe('image/png')
    expect(summarized['payloadLength']).toBe(dataUrl.split(',')[1].length)
    expect(summarized['preview']).toBe(dataUrl.split(',')[1].slice(0, 32))
  })

  test('summarizes a data-URL nested under a url field', () => {
    const dataUrl = 'data:text/plain;base64,' + 'B'.repeat(50)
    const body = { tools: [{ type: 'image', url: dataUrl }] }
    const out = normalizeProviderRequestBodyForCacheDebug({
      provider: 'x',
      body,
    }) as Record<string, unknown>
    const tools = out['tools'] as Array<Record<string, unknown>>
    const urlSummary = tools[0]['url'] as Record<string, unknown>
    expect(urlSummary['type']).toBe('data-url')
    expect(urlSummary['mediaType']).toBe('text/plain')
  })

  test('summarizes a data-URL nested under a file_data field', () => {
    const dataUrl = 'data:application/pdf;base64,' + 'C'.repeat(80)
    const body = { messages: [{ role: 'tool', file_data: dataUrl }] }
    const out = normalizeProviderRequestBodyForCacheDebug({
      provider: 'x',
      body,
    }) as Record<string, unknown>
    const messages = out['messages'] as Array<Record<string, unknown>>
    const fileData = messages[0]['file_data'] as Record<string, unknown>
    expect(fileData['type']).toBe('data-url')
    expect(fileData['mediaType']).toBe('application/pdf')
  })

  test('redacts prompt text while preserving structure and lengths', () => {
    const prompt = 'Explain the private implementation detail.'
    const body = {
      messages: [{ role: 'user', content: prompt }],
    }
    const out = normalizeProviderRequestBodyForCacheDebug({
      provider: 'x',
      body,
    }) as Record<string, unknown>
    const messages = out['messages'] as Array<Record<string, unknown>>
    const content = messages[0]['content'] as Record<string, unknown>

    expect(content).toEqual({
      type: 'redacted-text',
      length: prompt.length,
    })
    expect(JSON.stringify(out)).not.toContain(prompt)
  })

  test('redacts secret-like nested request fields', () => {
    const body = {
      tools: [
        {
          type: 'function',
          headers: {
            Authorization: 'Bearer provider-secret',
            'X-Api-Key': 'api-secret',
          },
        },
      ],
    }
    const out = normalizeProviderRequestBodyForCacheDebug({
      provider: 'x',
      body,
    }) as Record<string, unknown>
    const serialized = JSON.stringify(out)
    const tools = out['tools'] as Array<Record<string, unknown>>
    const headers = tools[0]['headers'] as Record<string, Record<string, unknown>>

    expect(headers['Authorization']).toEqual({
      type: 'redacted-secret',
      length: 'Bearer provider-secret'.length,
    })
    expect(headers['X-Api-Key']).toEqual({
      type: 'redacted-secret',
      length: 'api-secret'.length,
    })
    expect(serialized).not.toContain('provider-secret')
    expect(serialized).not.toContain('api-secret')
  })

  test('preserves a string arguments field verbatim (does not summarize)', () => {
    const args = '{"key":"value"}'
    const body = { tools: [{ arguments: args }] }
    const out = normalizeProviderRequestBodyForCacheDebug({
      provider: 'x',
      body,
    }) as Record<string, unknown>
    const tools = out['tools'] as Array<Record<string, unknown>>
    expect(tools[0]['arguments']).toBe(args)
  })
})
