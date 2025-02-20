import { expect, describe, it, beforeEach, afterEach } from 'bun:test'
import { checkTaskFile } from '../tools'
import fs from 'fs'
import path from 'path'

const TEST_OUTPUT_DIR = 'check-task-file-test-outputs'
const TEST_FILE = 'task-1.ts'

describe('checkTaskFile', () => {
  // Set up test file
  beforeEach(() => {
    if (!fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.mkdirSync(TEST_OUTPUT_DIR)
    }

    // Write a simple valid TypeScript file
    const testCode = `
// A simple TypeScript function
function add(a: number, b: number): number {
  return a + b;
}
console.log(add(1, 2));
`
    fs.writeFileSync(path.join(TEST_OUTPUT_DIR, TEST_FILE), testCode)
  })

  // Clean up after tests
  afterEach(() => {
    if (fs.existsSync(path.join(TEST_OUTPUT_DIR, TEST_FILE))) {
      fs.unlinkSync(path.join(TEST_OUTPUT_DIR, TEST_FILE))
    }
    if (fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.rmdirSync(TEST_OUTPUT_DIR)
    }
  })

  it('should validate a correct TypeScript file', async () => {
    const result = await checkTaskFile(
      path.join(TEST_OUTPUT_DIR, TEST_FILE),
      TEST_OUTPUT_DIR
    )
    console.log(result)
    expect(result.success).toBe(true)
  })

  it('should fail on invalid TypeScript', async () => {
    // Write invalid TypeScript - type error
    const invalidCode = `
const x: number = "string";  // Type error: string assigned to number
`
    fs.writeFileSync(path.join(TEST_OUTPUT_DIR, TEST_FILE), invalidCode)
    const result = await checkTaskFile(
      path.join(TEST_OUTPUT_DIR, TEST_FILE),
      TEST_OUTPUT_DIR
    )
    expect(result.success).toBe(false)
  })

  it('should fail on non-existent file', async () => {
    const result = await checkTaskFile('non-existent-file.ts', TEST_OUTPUT_DIR)
    expect(result.success).toBe(false)
  })

  it('should fail on syntax error', async () => {
    // Write invalid TypeScript - syntax error
    const invalidCode = `
function broken(x: number {  // Missing closing parenthesis
  return x + 1;
}
`
    fs.writeFileSync(path.join(TEST_OUTPUT_DIR, TEST_FILE), invalidCode)
    const result = await checkTaskFile(
      path.join(TEST_OUTPUT_DIR, TEST_FILE),
      TEST_OUTPUT_DIR
    )
    expect(result.success).toBe(false)
  })
})
