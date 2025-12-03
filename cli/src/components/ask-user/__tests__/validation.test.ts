/**
 * Unit tests for validation.ts
 * Testing validation logic for text input
 */

import { describe, it, expect } from 'bun:test'

import {
  validateOtherText,
  isTextEmpty,
  sanitizeTextInput,
} from '../utils/validation'

import type { QuestionValidation } from '../utils/validation'

describe('validateOtherText', () => {
  describe('default max length validation', () => {
    it('accepts text within default limit (500 chars)', () => {
      const text = 'a'.repeat(500)
      const result = validateOtherText(text)
      expect(result.isValid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('rejects text exceeding default limit', () => {
      const text = 'a'.repeat(501)
      const result = validateOtherText(text)
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Max 500 characters')
    })

    it('accepts empty text', () => {
      const result = validateOtherText('')
      expect(result.isValid).toBe(true)
    })
  })

  describe('custom max length validation', () => {
    const validation: QuestionValidation = {
      maxLength: 10,
    }

    it('accepts text within custom limit', () => {
      const result = validateOtherText('hello', validation)
      expect(result.isValid).toBe(true)
    })

    it('rejects text exceeding custom limit', () => {
      const result = validateOtherText('hello world!', validation)
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Max 10 characters')
    })
  })

  describe('min length validation', () => {
    const validation: QuestionValidation = {
      minLength: 5,
    }

    it('accepts text meeting minimum', () => {
      const result = validateOtherText('hello', validation)
      expect(result.isValid).toBe(true)
    })

    it('rejects text below minimum', () => {
      const result = validateOtherText('hi', validation)
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Min 5 characters')
    })
  })

  describe('pattern (regex) validation', () => {
    it('validates email pattern', () => {
      const validation: QuestionValidation = {
        pattern: '^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$',
        patternError: 'Please enter a valid email',
      }

      const validResult = validateOtherText('test@example.com', validation)
      expect(validResult.isValid).toBe(true)

      const invalidResult = validateOtherText('not-an-email', validation)
      expect(invalidResult.isValid).toBe(false)
      expect(invalidResult.error).toBe('Please enter a valid email')
    })

    it('validates number pattern', () => {
      const validation: QuestionValidation = {
        pattern: '^\\d+$',
        patternError: 'Numbers only',
      }

      expect(validateOtherText('12345', validation).isValid).toBe(true)
      expect(validateOtherText('abc123', validation).isValid).toBe(false)
    })

    it('uses default error message when patternError not provided', () => {
      const validation: QuestionValidation = {
        pattern: '^\\d+$',
      }

      const result = validateOtherText('abc', validation)
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Invalid format')
    })

    it('accepts empty text when pattern provided', () => {
      const validation: QuestionValidation = {
        pattern: '^\\d+$',
      }

      const result = validateOtherText('', validation)
      expect(result.isValid).toBe(true) // Empty bypasses pattern check
    })
  })

  describe('combined validations', () => {
    it('checks all validations in order', () => {
      const validation: QuestionValidation = {
        minLength: 5,
        maxLength: 10,
        pattern: '^[a-zA-Z]+$',
        patternError: 'Letters only',
      }

      // Too short
      expect(validateOtherText('hi', validation).isValid).toBe(false)

      // Too long
      expect(validateOtherText('hello world', validation).isValid).toBe(false)

      // Invalid pattern
      const patternResult = validateOtherText('hello1', validation)
      expect(patternResult.isValid).toBe(false)
      expect(patternResult.error).toBe('Letters only')

      // Valid
      expect(validateOtherText('hello', validation).isValid).toBe(true)
    })
  })

  describe('no validation rules', () => {
    it('accepts any text when no validation provided', () => {
      expect(validateOtherText('anything').isValid).toBe(true)
      expect(validateOtherText('').isValid).toBe(true)
      expect(validateOtherText('a'.repeat(1000)).isValid).toBe(false) // Still checks default max
    })
  })
})

describe('isTextEmpty', () => {
  it('returns true for undefined', () => {
    expect(isTextEmpty(undefined)).toBe(true)
  })

  it('returns true for empty string', () => {
    expect(isTextEmpty('')).toBe(true)
  })

  it('returns true for whitespace only', () => {
    expect(isTextEmpty('   ')).toBe(true)
    expect(isTextEmpty('\t\n  ')).toBe(true)
  })

  it('returns false for text with content', () => {
    expect(isTextEmpty('hello')).toBe(false)
    expect(isTextEmpty('  hello  ')).toBe(false)
  })
})

describe('sanitizeTextInput', () => {
  it('removes control characters', () => {
    const input = 'hello\x00world\x1F'
    const result = sanitizeTextInput(input)
    expect(result).toBe('hello world')
  })

  it('collapses multiple spaces', () => {
    const input = 'hello    world'
    const result = sanitizeTextInput(input)
    expect(result).toBe('hello world')
  })

  it('trims leading and trailing whitespace', () => {
    const input = '  hello world  '
    const result = sanitizeTextInput(input)
    expect(result).toBe('hello world')
  })

  it('handles tabs and newlines', () => {
    const input = 'hello\t\nworld'
    const result = sanitizeTextInput(input)
    expect(result).toBe('hello world')
  })

  it('combines all sanitization', () => {
    const input = '  hello\x00\x01    \t\n  world\x7F  '
    const result = sanitizeTextInput(input)
    expect(result).toBe('hello world')
  })

  it('returns empty string for whitespace-only input', () => {
    const input = '   \t\n   '
    const result = sanitizeTextInput(input)
    expect(result).toBe('')
  })

  it('preserves valid special characters', () => {
    const input = 'hello@example.com'
    const result = sanitizeTextInput(input)
    expect(result).toBe('hello@example.com')
  })
})
