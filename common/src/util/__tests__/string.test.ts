import { replaceNonStandardPlaceholderComments } from '../string'

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
  // ... existing code ...
  console.log('Hello');
  // ... existing code ...
}
`
    expect(replaceNonStandardPlaceholderComments(input)).toBe(expected)
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
  // ... existing code ...
  console.log('Hello');
  // ... existing code ...
}
`
    expect(replaceNonStandardPlaceholderComments(input)).toBe(expected)
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
    // ... existing code ...
    print('Hello')
    // ... existing code ...
`
    expect(replaceNonStandardPlaceholderComments(input)).toBe(expected)
  })
})
