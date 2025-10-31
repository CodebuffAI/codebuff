import { describe, expect, test } from 'bun:test'

import { formatValidationError } from '../validation-error-formatting'

describe('formatValidationError', () => {
  test('parses JSON array payloads and extracts field/message', () => {
    const raw = `[
  {
    "code": "custom",
    "path": [
      "toolNames"
    ],
    "message": "Non-empty spawnableAgents array requires the 'spawn_agents' tool. Add 'spawn_agents' to toolNames or remove spawnableAgents."
  }
]`

    const result = formatValidationError(raw)

    expect(result.fieldName).toBe('toolNames')
    expect(result.message).toBe(
      "Non-empty spawnableAgents array requires the 'spawn_agents' tool. Add 'spawn_agents' to toolNames or remove spawnableAgents.",
    )
  })

  test('strips agent name prefix', () => {
    const result = formatValidationError('Agent "demo" (demo.ts): Invalid input: expected string, received number')

    expect(result.fieldName).toBeUndefined()
    expect(result.message).toBe('Invalid input: expected string, received number')
  })

  test('extracts field:message pattern', () => {
    const result = formatValidationError('instructions: Required field is missing')

    expect(result.fieldName).toBe('instructions')
    expect(result.message).toBe('Required field is missing')
  })

  test('handles messages without field patterns', () => {
    const result = formatValidationError('Schema validation failed: Generic error')

    expect(result.fieldName).toBeUndefined()
    expect(result.message).toBe('Generic error')
  })

  test('handles nested path from JSON error', () => {
    const raw = `[
  {
    "path": ["outputSchema", "properties", "summary"],
    "message": "Required"
  }
]`

    const result = formatValidationError(raw)

    expect(result.fieldName).toBe('outputSchema.properties.summary')
    expect(result.message).toBe('Required')
  })

  test('handles empty string input', () => {
    const result = formatValidationError('')

    expect(result.fieldName).toBeUndefined()
    expect(result.message).toBe('Unknown validation error')
  })

  test('handles JSON object (not array) with error', () => {
    const raw = `{"path": ["field"], "message": "Invalid value"}`

    const result = formatValidationError(raw)

    expect(result.fieldName).toBe('field')
    expect(result.message).toBe('Invalid value')
  })

  test('handles JSON with empty path array', () => {
    const raw = `[{"path": [], "message": "Root level error"}]`

    const result = formatValidationError(raw)

    expect(result.fieldName).toBeUndefined()
    expect(result.message).toBe('Root level error')
  })

  test('handles malformed JSON gracefully', () => {
    const raw = '[{"path": ["field"], invalid json'

    const result = formatValidationError(raw)

    expect(result.fieldName).toBeUndefined()
    expect(result.message).toBe('[{"path": ["field"], invalid json')
  })

  test('handles colon in message part correctly', () => {
    const result = formatValidationError('fieldName: Error: something went wrong')

    expect(result.fieldName).toBe('fieldName')
    expect(result.message).toBe('Error: something went wrong')
  })

  test('handles field pattern with no message after colon', () => {
    const result = formatValidationError('fieldName:')

    expect(result.fieldName).toBeUndefined()
    expect(result.message).toBe('fieldName:')
  })

  test('handles JSON with missing message property', () => {
    const raw = `[{"path": ["field"], "code": "custom"}]`

    const result = formatValidationError(raw)

    expect(result.fieldName).toBe('field')
    expect(result.message).toBe(raw)
  })
})
