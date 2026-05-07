import { describe, expect, test } from 'bun:test'

import {
  FREEBUFF_MODELS,
  SUPPORTED_FREEBUFF_MODELS,
} from '@codebuff/common/constants/freebuff-models'

import { getInstantAdmitCapacity } from '../config'

describe('free session config', () => {
  test('every selectable freebuff model has instant-admit capacity', () => {
    for (const model of FREEBUFF_MODELS) {
      expect(getInstantAdmitCapacity(model.id)).toBeGreaterThan(0)
    }
  })

  test('every supported freebuff model has instant-admit capacity', () => {
    for (const model of SUPPORTED_FREEBUFF_MODELS) {
      expect(getInstantAdmitCapacity(model.id)).toBeGreaterThan(0)
    }
  })
})
