import { describe, expect, it } from 'bun:test'

import { EXISTING_CODE_MARKER } from '../../old-constants'
import { pluralize, replaceNonStandardPlaceholderComments } from '../string'

describe('pluralize', () => {
  it('should handle singular and plural cases correctly', () => {
    expect(pluralize(1, 'test')).toBe('1 test')
    expect(pluralize(0, 'test')).toBe('0 tests')
    expect(pluralize(2, 'test')).toBe('2 tests')
  })

  it('should handle words ending in y', () => {
    expect(pluralize(1, 'city')).toBe('1 city')
    expect(pluralize(2, 'city')).toBe('2 cities')
    expect(pluralize(3, 'repository')).toBe('3 repositories')
  })

  it('should handle words ending in f/fe', () => {
    expect(pluralize(1, 'leaf')).toBe('1 leaf')
    expect(pluralize(2, 'leaf')).toBe('2 leaves')
    expect(pluralize(1, 'knife')).toBe('1 knife')
    expect(pluralize(2, 'knife')).toBe('2 knives')
    expect(pluralize(1, 'life')).toBe('1 life')
    expect(pluralize(3, 'life')).toBe('3 lives')
  })

  it('should handle words ending in s, sh, ch, x, z, o', () => {
    expect(pluralize(2, 'bus')).toBe('2 buses')
    expect(pluralize(2, 'box')).toBe('2 boxes')
    expect(pluralize(2, 'church')).toBe('2 churches')
    expect(pluralize(2, 'dish')).toBe('2 dishes')
  })

  it('should handle regular plurals', () => {
    expect(pluralize(1, 'agent')).toBe('1 agent')
    expect(pluralize(0, 'agent')).toBe('0 agents')
    expect(pluralize(5, 'member')).toBe('5 members')
    expect(pluralize(10, 'invitation')).toBe('10 invitations')
  })
})

describe('replaceNonStandardPlaceholderComments', () => {
  it('should replace C-style comments', () => {
    const input = `
function example() {
  // ... some code ...
  console.log('Hello');
  // ... rest of the function ...
}
`
    const expected = `
function example() {
  ${EXISTING_CODE_MARKER}
  console.log('Hello');
  ${EXISTING_CODE_MARKER}
}
`
    expect(
      replaceNonStandardPlaceholderComments(input, EXISTING_CODE_MARKER),
    ).toBe(expected)
  })

  it('should replace multi-line C-style comments', () => {
    const input = `
function example() {
  /* ... some code ... */
  console.log('Hello');
  /* ... rest of the function ... */
}
`
    const expected = `
function example() {
  ${EXISTING_CODE_MARKER}
  console.log('Hello');
  ${EXISTING_CODE_MARKER}
}
`
    expect(
      replaceNonStandardPlaceholderComments(input, EXISTING_CODE_MARKER),
    ).toBe(expected)
  })

  it('should replace Python-style comments', () => {
    const input = `
def example():
    # ... some code ...
    print('Hello')
    # ... rest of the function ...
`
    const expected = `
def example():
    ${EXISTING_CODE_MARKER}
    print('Hello')
    ${EXISTING_CODE_MARKER}
`
    expect(
      replaceNonStandardPlaceholderComments(input, EXISTING_CODE_MARKER),
    ).toBe(expected)
  })

  it('should replace JSX comments', () => {
    const input = `
function Example() {
  return (
    <div>
      {/* ... existing code ... */}
      <p>Hello, World!</p>
      {/* ...rest of component... */}
    </div>
  );
}
`
    const expected = `
function Example() {
  return (
    <div>
      ${EXISTING_CODE_MARKER}
      <p>Hello, World!</p>
      ${EXISTING_CODE_MARKER}
    </div>
  );
}
`
    expect(
      replaceNonStandardPlaceholderComments(input, EXISTING_CODE_MARKER),
    ).toBe(expected)
  })
})
