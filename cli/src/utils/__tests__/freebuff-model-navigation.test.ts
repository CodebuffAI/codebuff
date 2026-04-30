import { describe, expect, test } from 'bun:test'

import {
  nextFreebuffModelId,
  resolveFreebuffModelCommitTarget,
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

describe('resolveFreebuffModelCommitTarget', () => {
  test('returns null when focus is on a closed model', () => {
    expect(
      resolveFreebuffModelCommitTarget({
        focusedId: 'glm',
        committedId: null,
        isSelectable: (id) => id !== 'glm',
      }),
    ).toBeNull()
  })

  test('commits the focused model when it is selectable', () => {
    expect(
      resolveFreebuffModelCommitTarget({
        focusedId: 'minimax',
        committedId: null,
        isSelectable: (id) => id === 'minimax',
      }),
    ).toBe('minimax')
  })

  test('returns null when the target is already committed', () => {
    expect(
      resolveFreebuffModelCommitTarget({
        focusedId: 'minimax',
        committedId: 'minimax',
        isSelectable: () => true,
      }),
    ).toBeNull()
  })
})
