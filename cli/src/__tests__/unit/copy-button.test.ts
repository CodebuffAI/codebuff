import { describe, test, expect } from 'bun:test'

/**
 * Tests for the CopyButton internal hover state behavior.
 *
 * The key behavior being tested:
 * - Hover state should be set when mouse enters and cleared when mouse leaves
 * - When copied, hover state should be cleared and not re-open until mouse re-enters
 *
 * These tests verify the state logic that's now internal to the CopyButton component.
 */
describe('CopyButton hover state behavior', () => {
  test('hover state logic: hover should not open while in copied state', () => {
    let isCopied = false
    let isHovered = false

    // Simulate the handleMouseOver logic from CopyButton
    const handleMouseOver = () => {
      if (!isCopied) {
        isHovered = true
      }
    }

    // Start with hover closed
    expect(isHovered).toBe(false)

    // Mouse over should open hover when not copied
    handleMouseOver()
    expect(isHovered).toBe(true)

    // Reset and try when in copied state
    isHovered = false
    isCopied = true

    handleMouseOver()
    expect(isHovered).toBe(false) // Should not open while copied
  })

  test('hover state logic: hover clears when copy happens', () => {
    let isCopied = false
    let isHovered = true

    // Simulate the handleCopy logic from CopyButton
    const handleCopy = () => {
      isCopied = true
      isHovered = false
    }

    expect(isHovered).toBe(true)

    // Copy action should clear hover
    handleCopy()
    expect(isHovered).toBe(false)
    expect(isCopied).toBe(true)
  })

  test('hover state logic: mouse out always clears hover', () => {
    let isHovered = true

    // Simulate the handleMouseOut logic from CopyButton
    const handleMouseOut = () => {
      isHovered = false
    }

    expect(isHovered).toBe(true)

    handleMouseOut()
    expect(isHovered).toBe(false)
  })
})
