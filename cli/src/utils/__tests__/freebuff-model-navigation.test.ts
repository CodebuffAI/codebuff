import { describe, expect, test } from 'bun:test'

import {
  codebirdsModelNavigationDirectionForKey,
  nextFreebuffModelId,
} from '../codebirds-model-navigation'

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

describe('codebirdsModelNavigationDirectionForKey', () => {
  test('maps arrow keys to model navigation directions', () => {
    expect(codebirdsModelNavigationDirectionForKey({ name: 'down' })).toBe(
      'forward',
    )
    expect(codebirdsModelNavigationDirectionForKey({ name: 'right' })).toBe(
      'forward',
    )
    expect(codebirdsModelNavigationDirectionForKey({ name: 'up' })).toBe(
      'backward',
    )
    expect(codebirdsModelNavigationDirectionForKey({ name: 'left' })).toBe(
      'backward',
    )
  })

  test('maps tab and shift-tab to model navigation directions', () => {
    expect(codebirdsModelNavigationDirectionForKey({ name: 'tab' })).toBe(
      'forward',
    )
    expect(
      codebirdsModelNavigationDirectionForKey({ name: 'tab', shift: true }),
    ).toBe('backward')
  })

  test('maps terminal tab sequences to model navigation directions', () => {
    expect(codebirdsModelNavigationDirectionForKey({ sequence: '\t' })).toBe(
      'forward',
    )
    expect(
      codebirdsModelNavigationDirectionForKey({ sequence: '\x1b[9u' }),
    ).toBe('forward')
    expect(
      codebirdsModelNavigationDirectionForKey({ sequence: '\x1b[Z' }),
    ).toBe('backward')
    expect(
      codebirdsModelNavigationDirectionForKey({ sequence: '\x1b[9;2u' }),
    ).toBe('backward')
    expect(
      codebirdsModelNavigationDirectionForKey({ sequence: '\x1b[27;2;9~' }),
    ).toBe('backward')
  })

  test('ignores non-navigation keys', () => {
    expect(codebirdsModelNavigationDirectionForKey({ name: 'enter' })).toBeNull()
  })
})
