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
})
