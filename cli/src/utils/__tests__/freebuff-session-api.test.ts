import { afterEach, expect, spyOn, test } from 'bun:test'
import {
  FREEBUFF_GLM_V52_MODEL_ID,
  resolveFreebuffModelForAccessTier,
} from '@codebuff/common/constants/freebuff-models'

import { callFreebuffSession } from '../freebuff-session-api'

let fetchSpy: ReturnType<typeof spyOn> | undefined

afterEach(() => {
  fetchSpy?.mockRestore()
  fetchSpy = undefined
})

test('full-tier referral GLM reaches the session POST header unchanged', async () => {
  fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ status: 'none' }), {
      headers: { 'content-type': 'application/json' },
    }),
  )
  const resolved = resolveFreebuffModelForAccessTier(
    FREEBUFF_GLM_V52_MODEL_ID,
    'full',
  )

  await callFreebuffSession('POST', 'test-token', { model: resolved })

  expect(fetchSpy).toHaveBeenCalledTimes(1)
  const [, init] = fetchSpy.mock.calls[0]!
  expect(new Headers(init?.headers).get('x-freebuff-model')).toBe(
    FREEBUFF_GLM_V52_MODEL_ID,
  )
})
