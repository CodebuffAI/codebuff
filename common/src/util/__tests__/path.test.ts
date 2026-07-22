import path from 'path'

import { describe, expect, test } from 'bun:test'

import { isPathInside } from '../path'

describe('isPathInside', () => {
  test('accepts the root itself and a child when root ends in a separator', () => {
    const root = path.parse(process.cwd()).root

    expect(isPathInside(root, root)).toBe(true)
    expect(isPathInside(root, path.join(root, 'project.txt'))).toBe(true)
  })

  test('rejects parents, sibling prefixes, and other filesystem roots', () => {
    const root = path.resolve('workspace', 'project')

    expect(isPathInside(root, path.dirname(root))).toBe(false)
    expect(isPathInside(root, `${root}-private`)).toBe(false)
    expect(isPathInside(root, path.parse(root).root)).toBe(false)
  })
})
