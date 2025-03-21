import { describe, it, expect, mock } from 'bun:test'
import { preserveCommentsInEditSnippet } from '../fast-rewrite'
import { TEST_USER_ID } from 'common/constants'

// Mock database interactions
mock.module('pg-pool', () => ({
  Pool: class {
    connect() {
      return {
        query: () => ({
          rows: [{ id: 'test-user-id' }],
          rowCount: 1,
        }),
        release: () => {},
      }
    }
  },
}))

// Mock message saving
mock.module('backend/llm-apis/message-cost-tracker', () => ({
  saveMessage: () => Promise.resolve(),
}))

describe('preserveCommentsInEditSnippet', () => {
  it('should preserve existing comments from original file', async () => {
    const initialContent = `
// This is a comment
function test() {
  // Another comment
  return true;
}
`.trim()

    const editSnippet = `
function test() {
  return true;
}
`.trim()

    const result = await preserveCommentsInEditSnippet(
      initialContent,
      editSnippet,
      'test.ts',
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID
    )

    expect(result).toBe(`
// This is a comment
function test() {
  // Another comment
  return true;
}
`.trim())
  })

  it('should not add comments that are not in the original file', async () => {
    const initialContent = `
function test() {
  return true;
}
`.trim()

    const editSnippet = `
// New comment
function test() {
  // Another new comment
  return true;
}
`.trim()

    const result = await preserveCommentsInEditSnippet(
      initialContent,
      editSnippet,
      'test.ts',
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID
    )

    expect(result).toBe(`
function test() {
  return true;
}
`.trim())
  })

  it('should return edit snippet unchanged when no comments need to be preserved', async () => {
    const initialContent = `
function test() {
  return true;
}
`.trim()

    const editSnippet = `
function test() {
  return false;
}
`.trim()

    const result = await preserveCommentsInEditSnippet(
      initialContent,
      editSnippet,
      'test.ts',
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID
    )

    expect(result).toBe(editSnippet)
  })

  it('should remove comments about edits but keep other new comments', async () => {
    const initialContent = `
function test() {
  // Important: Always return true
  return true;
}
`.trim()

    const editSnippet = `
// Add new parameter
function test(flag: boolean) {
  // Important: Always return true
  // Change return value based on flag
  return flag;
}
`.trim()

    const result = await preserveCommentsInEditSnippet(
      initialContent,
      editSnippet,
      'test.ts',
      'clientSessionId',
      'fingerprintId',
      'userInputId',
      TEST_USER_ID
    )

    expect(result).toBe(`
function test(flag: boolean) {
  // Important: Always return true
  return flag;
}
`.trim())
  })
})