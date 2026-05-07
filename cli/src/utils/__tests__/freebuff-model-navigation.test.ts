import { describe, expect, test } from 'bun:test'

import {
  freebuffModelNavigationDirectionForKey,
  nextFreebuffModelId,
} from '../freebuff-model-navigation'

describe('nextFreebuffModelId', () => {
  test('moves to the next model when moving forward', () => {
    const modelIds = ['glm', 'minimax']

    expect(
      nextFreebuffModelId({
        modelIds,
        focusedId: 'minimax',
        direction: 'forward',
      }),
    ).toBe('glm')
  })

  test('moves to the previous model when moving backward', () => {
    const modelIds = ['glm', 'minimax']

    expect(
      nextFreebuffModelId({
        modelIds,
        focusedId: 'minimax',
        direction: 'backward',
      }),
    ).toBe('glm')
  })

  test('wraps through every model regardless of selectability', () => {
    const modelIds = ['glm', 'minimax', 'other']

    expect(
      nextFreebuffModelId({
        modelIds,
        focusedId: 'minimax',
        direction: 'forward',
      }),
    ).toBe('other')
  })

  test('returns null when no model exists', () => {
    expect(
      nextFreebuffModelId({
        modelIds: [],
        focusedId: 'glm',
        direction: 'forward',
      }),
    ).toBeNull()
  })
})

describe('freebuffModelNavigationDirectionForKey', () => {
  test('maps arrow keys to model navigation directions', () => {
    expect(freebuffModelNavigationDirectionForKey({ name: 'down' })).toBe(
      'forward',
    )
    expect(freebuffModelNavigationDirectionForKey({ name: 'right' })).toBe(
      'forward',
    )
    expect(freebuffModelNavigationDirectionForKey({ name: 'up' })).toBe(
      'backward',
    )
    expect(freebuffModelNavigationDirectionForKey({ name: 'left' })).toBe(
      'backward',
    )
  })

  test('maps tab and shift-tab to model navigation directions', () => {
    expect(freebuffModelNavigationDirectionForKey({ name: 'tab' })).toBe(
      'forward',
    )
    expect(
      freebuffModelNavigationDirectionForKey({ name: 'tab', shift: true }),
    ).toBe('backward')
  })

  test('maps terminal tab sequences to model navigation directions', () => {
    expect(freebuffModelNavigationDirectionForKey({ sequence: '\t' })).toBe(
      'forward',
    )
    expect(
      freebuffModelNavigationDirectionForKey({ sequence: '\x1b[9u' }),
    ).toBe('forward')
    expect(
      freebuffModelNavigationDirectionForKey({ sequence: '\x1b[Z' }),
    ).toBe('backward')
    expect(
      freebuffModelNavigationDirectionForKey({ sequence: '\x1b[9;2u' }),
    ).toBe('backward')
    expect(
      freebuffModelNavigationDirectionForKey({ sequence: '\x1b[27;2;9~' }),
    ).toBe('backward')
  })

  test('ignores non-navigation keys', () => {
    expect(freebuffModelNavigationDirectionForKey({ name: 'enter' })).toBeNull()
  })
})
