import { describe, expect, test } from 'bun:test'
import path from 'path'

import { getProjectStorageKey } from '../project-files'

describe('project storage identity', () => {
  test('isolates repositories that share a basename', () => {
    const clientApp = getProjectStorageKey(path.join('/work', 'client', 'app'))
    const internalApp = getProjectStorageKey(
      path.join('/work', 'internal', 'app'),
    )

    expect(clientApp.startsWith('app-')).toBe(true)
    expect(internalApp.startsWith('app-')).toBe(true)
    expect(clientApp).not.toBe(internalApp)
  })

  test('is deterministic for equivalent absolute paths', () => {
    const root = path.join('/work', 'project')
    expect(getProjectStorageKey(root)).toBe(
      getProjectStorageKey(path.join('/work', '.', 'project')),
    )
  })
})
