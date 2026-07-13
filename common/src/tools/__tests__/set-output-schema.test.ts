import { describe, expect, test } from 'bun:test'

import { setOutputParams } from '../params/tool/set-output'

describe('set_output input schema', () => {
  test('decodes a JSON object string inside data', () => {
    const parsed = setOutputParams.inputSchema.safeParse({
      data: '{"schemaVersion":1,"verdict":"NON_BLOCKING"}',
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.data).toEqual({
        schemaVersion: 1,
        verdict: 'NON_BLOCKING',
      })
    }
  })

  test.each([
    '```json\n{"schemaVersion":1,"verdict":"NON_BLOCKING"}\n```',
    '// json\n{"schemaVersion":1,"verdict":"NON_BLOCKING"}',
  ])('decodes a wrapped JSON object string inside data', (data) => {
    const parsed = setOutputParams.inputSchema.safeParse({ data })

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.data).toEqual({
        schemaVersion: 1,
        verdict: 'NON_BLOCKING',
      })
    }
  })

  test.each(['not json', '[]', 'null', '"text"'])(
    'rejects a data string that is not a JSON object: %s',
    (data) => {
      const parsed = setOutputParams.inputSchema.safeParse({ data })

      expect(parsed.success).toBe(false)
      if (!parsed.success) {
        expect(parsed.error.issues).toContainEqual(
          expect.objectContaining({ path: ['data'] }),
        )
      }
    },
  )
})
