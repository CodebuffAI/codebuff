import { describe, expect, test } from 'bun:test'
import { nextUntitledProjectName } from './project-name'

describe('automatic project names', () => {
  test('starts with Untitled and increments after the highest existing number', () => {
    expect(nextUntitledProjectName([])).toBe('Untitled')
    expect(nextUntitledProjectName(['Untitled'])).toBe('Untitled 2')
    expect(nextUntitledProjectName(['Untitled 2', 'Untitled', 'Untitled 9'])).toBe('Untitled 10')
  })

  test('does not reuse gaps or depend on catalog ordering', () => {
    expect(nextUntitledProjectName(['Untitled 5', 'Untitled 2'])).toBe('Untitled 6')
  })

  test('matches case and surrounding whitespace without counting other titles', () => {
    expect(nextUntitledProjectName([
      null, undefined, 'My project', 'Untitled notes', 'Untitled 0',
      'Untitled 02', 'Untitled -3', 'Untitled 2.5', 'Untitled 1e3',
      'Untitled 99999999999999999999999', ' untitled 3 ',
    ])).toBe('Untitled 4')
  })
})
