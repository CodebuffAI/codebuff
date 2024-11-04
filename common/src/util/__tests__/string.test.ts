import { EXISTING_CODE_MARKER } from 'src/constants'
import { replaceNonStandardPlaceholderComments } from '../string'
// @ts-ignore
import { describe, expect, it } from 'bun:test'

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
      replaceNonStandardPlaceholderComments(input, EXISTING_CODE_MARKER)
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
      replaceNonStandardPlaceholderComments(input, EXISTING_CODE_MARKER)
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
      replaceNonStandardPlaceholderComments(input, EXISTING_CODE_MARKER)
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
      replaceNonStandardPlaceholderComments(input, EXISTING_CODE_MARKER)
    ).toBe(expected)
  })
})
