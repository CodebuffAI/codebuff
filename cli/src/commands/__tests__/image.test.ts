import { describe, test, expect } from 'bun:test'

/**
 * Tests for the handleImageCommand argument parsing behavior.
 *
 * These tests verify the parsing logic independently of the actual
 * validateAndAddImage implementation by testing the parsing function directly.
 */

// Extract the parsing logic that handleImageCommand uses
// New simplified implementation: split on whitespace
function parseImageCommandArgs(args: string): {
  imagePath: string | null
  message: string
} {
  const [imagePath, ...rest] = args.trim().split(/\s+/)

  if (!imagePath) {
    return { imagePath: null, message: '' }
  }

  return { imagePath, message: rest.join(' ') }
}

describe('handleImageCommand parsing', () => {
  describe('argument parsing', () => {
    test('parses image path only', () => {
      const result = parseImageCommandArgs('./screenshot.png')
      expect(result.imagePath).toBe('./screenshot.png')
      expect(result.message).toBe('')
    })

    test('parses image path with message', () => {
      const result = parseImageCommandArgs(
        './screenshot.png please analyze this',
      )
      expect(result.imagePath).toBe('./screenshot.png')
      expect(result.message).toBe('please analyze this')
    })

    test('parses image path with multi-word message', () => {
      const result = parseImageCommandArgs(
        './image.jpg what is in this picture?',
      )
      expect(result.imagePath).toBe('./image.jpg')
      expect(result.message).toBe('what is in this picture?')
    })

    test('handles absolute paths with message', () => {
      const result = parseImageCommandArgs('/path/to/file.png describe the UI')
      expect(result.imagePath).toBe('/path/to/file.png')
      expect(result.message).toBe('describe the UI')
    })

    test('trims whitespace from input', () => {
      const result = parseImageCommandArgs('  ./image.png  ')
      expect(result.imagePath).toBe('./image.png')
      expect(result.message).toBe('')
    })

    test('handles multiple spaces between path and message', () => {
      const result = parseImageCommandArgs('./image.png    hello world')
      expect(result.imagePath).toBe('./image.png')
      // The regex only captures content after the first whitespace group
      expect(result.message).toBe('hello world')
    })
  })

  describe('invalid input handling', () => {
    test('returns null imagePath for empty input', () => {
      const result = parseImageCommandArgs('')
      expect(result.imagePath).toBeNull()
      expect(result.message).toBe('')
    })

    test('returns null imagePath for whitespace-only input', () => {
      const result = parseImageCommandArgs('   ')
      expect(result.imagePath).toBeNull()
      expect(result.message).toBe('')
    })
  })

  describe('edge cases', () => {
    test('handles filenames with extensions', () => {
      const result = parseImageCommandArgs('image.jpeg')
      expect(result.imagePath).toBe('image.jpeg')
    })

    test('handles relative paths', () => {
      const result = parseImageCommandArgs('../screenshots/test.png')
      expect(result.imagePath).toBe('../screenshots/test.png')
    })

    test('handles tilde paths', () => {
      const result = parseImageCommandArgs('~/Downloads/image.png')
      expect(result.imagePath).toBe('~/Downloads/image.png')
    })
  })
})
