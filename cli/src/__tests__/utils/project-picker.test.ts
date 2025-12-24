import { describe, test, expect } from 'bun:test'
import path from 'path'

import { shouldShowProjectPicker } from '../../utils/project-picker'

describe('cli/utils/project-picker', () => {
  test('returns true when start cwd is home directory', () => {
    const root = path.parse(process.cwd()).root
    const homeDir = path.join(root, 'home', 'test-user')

    expect(shouldShowProjectPicker(homeDir, homeDir)).toBe(true)
  })

  test('returns true when start cwd is a parent of home directory', () => {
    const root = path.parse(process.cwd()).root
    const homeDir = path.join(root, 'home', 'test-user')
    const parentDir = path.dirname(homeDir)

    expect(shouldShowProjectPicker(parentDir, homeDir)).toBe(true)
    expect(shouldShowProjectPicker(root, homeDir)).toBe(true)
  })

  test('returns false when start cwd is a child of home directory', () => {
    const root = path.parse(process.cwd()).root
    const homeDir = path.join(root, 'home', 'test-user')
    const childDir = path.join(homeDir, 'projects')

    expect(shouldShowProjectPicker(childDir, homeDir)).toBe(false)
  })

  test('returns false when start cwd is a sibling of home directory', () => {
    const root = path.parse(process.cwd()).root
    const homeDir = path.join(root, 'home', 'test-user')
    const siblingDir = path.join(root, 'home', 'other-user')

    expect(shouldShowProjectPicker(siblingDir, homeDir)).toBe(false)
  })
})
