import { describe, expect, test } from 'bun:test'

import {
  nextSelectableFreebuffModelId,
  resolveFreebuffModelCommitTarget,
} from '../freebuff-model-navigation'

describe('nextSelectableFreebuffModelId', () => {
  test('skips unavailable models when moving forward', () => {
    const modelIds = ['glm', 'minimax']

    expect(
      nextSelectableFreebuffModelId({
        modelIds,
        focusedId: 'minimax',
        direction: 'forward',
        isSelectable: (id) => id !== 'glm',
      }),
    ).toBe('minimax')
  })

  test('skips unavailable models when moving backward', () => {
    const modelIds = ['glm', 'minimax']

    expect(
      nextSelectableFreebuffModelId({
        modelIds,
        focusedId: 'minimax',
        direction: 'backward',
        isSelectable: (id) => id !== 'glm',
      }),
    ).toBe('minimax')
  })

  test('moves to the next available model when more than one is selectable', () => {
    const modelIds = ['glm', 'minimax', 'other']

    expect(
      nextSelectableFreebuffModelId({
        modelIds,
        focusedId: 'minimax',
        direction: 'forward',
        isSelectable: (id) => id !== 'glm',
      }),
    ).toBe('other')
  })

  test('returns null when no selectable model exists', () => {
    expect(
      nextSelectableFreebuffModelId({
        modelIds: ['glm'],
        focusedId: 'glm',
        direction: 'forward',
        isSelectable: () => false,
      }),
    ).toBeNull()
  })
})

describe('resolveFreebuffModelCommitTarget', () => {
  test('falls back to the selected model when focus is on a closed model', () => {
    expect(
      resolveFreebuffModelCommitTarget({
        focusedId: 'glm',
        selectedId: 'minimax',
        committedId: null,
        isSelectable: (id) => id !== 'glm',
      }),
    ).toBe('minimax')
  })

  test('commits the focused model when it is selectable', () => {
    expect(
      resolveFreebuffModelCommitTarget({
        focusedId: 'minimax',
        selectedId: 'glm',
        committedId: null,
        isSelectable: (id) => id === 'minimax',
      }),
    ).toBe('minimax')
  })

  test('returns null when the target is already committed', () => {
    expect(
      resolveFreebuffModelCommitTarget({
        focusedId: 'minimax',
        selectedId: 'minimax',
        committedId: 'minimax',
        isSelectable: () => true,
      }),
    ).toBeNull()
  })
})
