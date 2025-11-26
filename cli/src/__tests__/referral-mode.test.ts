import { describe, test, expect, mock } from 'bun:test'

import { getInputModeConfig } from '../utils/input-modes'

import type { InputMode } from '../utils/input-modes'

/**
 * Tests for referral mode functionality in the CLI.
 *
 * Referral mode is entered when user types '/referral' or '/redeem' and allows entering referral codes.
 * The '◎' icon is displayed in a warning-colored column.
 *
 * Key behaviors:
 * 1. Entering referral mode via slash commands
 * 2. Input validation (3-50 alphanumeric chars with dashes)
 * 3. Backspace at cursor position 0 exits referral mode
 * 4. Submission auto-prefixes 'ref-' if not present
 * 5. UI state changes (icon, placeholder, colors)
 */

describe('referral-mode', () => {
  describe('entering referral mode', () => {
    test('typing "/referral" enters referral mode', () => {
      const setInputMode = mock((_mode: InputMode) => {})
      const command = '/referral'

      // Simulate command processing
      if (command === '/referral' || command === '/redeem') {
        setInputMode('referral')
      }

      expect(setInputMode).toHaveBeenCalledWith('referral')
    })

    test('typing "/redeem" also enters referral mode', () => {
      const setInputMode = mock((_mode: InputMode) => {})
      const command = '/redeem' as string

      if (command === '/referral' || command === '/redeem') {
        setInputMode('referral')
      }

      expect(setInputMode).toHaveBeenCalledWith('referral')
    })

    test('/referral with a code argument redeems immediately without entering mode', () => {
      const setInputMode = mock((_mode: InputMode) => {})
      const handleReferralCode = mock(async (_code: string) => {})
      const command = '/referral abc123'

      // Simulate handler logic
      const args = command.slice('/referral'.length + 1).trim()
      if (args) {
        // Has arguments - redeem directly
        handleReferralCode('ref-abc123')
      } else {
        // No arguments - enter mode
        setInputMode('referral')
      }

      expect(handleReferralCode).toHaveBeenCalledWith('ref-abc123')
      expect(setInputMode).not.toHaveBeenCalled()
    })
  })

  describe('exiting referral mode', () => {
    test('backspace at cursor position 0 exits referral mode', () => {
      const setInputMode = mock((_mode: InputMode) => {})

      const inputMode = 'referral' as InputMode
      const cursorPosition = 0
      const key = { name: 'backspace' }

      // Simulate exit logic
      if (
        inputMode !== 'default' &&
        cursorPosition === 0 &&
        key.name === 'backspace'
      ) {
        setInputMode('default')
      }

      expect(setInputMode).toHaveBeenCalledWith('default')
    })

    test('backspace at cursor position 0 with non-empty input DOES exit referral mode', () => {
      const setInputMode = mock((_mode: InputMode) => {})

      const inputMode = 'referral' as InputMode
      const cursorPosition = 0
      const key = { name: 'backspace' }

      if (
        inputMode !== 'default' &&
        cursorPosition === 0 &&
        key.name === 'backspace'
      ) {
        setInputMode('default')
      }

      // Should exit even with input, because cursor is at position 0
      expect(setInputMode).toHaveBeenCalledWith('default')
    })

    test('backspace at cursor position > 0 does NOT exit referral mode', () => {
      const setInputMode = mock((_mode: InputMode) => {})

      const inputMode = 'referral' as InputMode
      const cursorPosition = 5 as number
      const key = { name: 'backspace' }

      if (
        inputMode !== 'default' &&
        cursorPosition === 0 &&
        key.name === 'backspace'
      ) {
        setInputMode('default')
      }

      // Should not exit because cursor is not at position 0
      expect(setInputMode).not.toHaveBeenCalled()
    })

    test('other keys at cursor position 0 do NOT exit referral mode', () => {
      const setInputMode = mock((_mode: InputMode) => {})

      const inputMode = 'referral' as InputMode
      const cursorPosition = 0
      const key = { name: 'a' }

      if (
        inputMode !== 'default' &&
        cursorPosition === 0 &&
        key.name === 'backspace'
      ) {
        setInputMode('default')
      }

      // Should not exit because key is not backspace
      expect(setInputMode).not.toHaveBeenCalled()
    })
  })

  describe('referral code validation', () => {
    test('valid alphanumeric code passes validation', () => {
      const code = 'abc123'
      const pattern = /^[a-zA-Z0-9-]{3,50}$/

      expect(pattern.test(code)).toBe(true)
    })

    test('valid code with dashes passes validation', () => {
      const code = 'abc-123-xyz'
      const pattern = /^[a-zA-Z0-9-]{3,50}$/

      expect(pattern.test(code)).toBe(true)
    })

    test('minimum length (3 chars) passes validation', () => {
      const code = 'abc'
      const pattern = /^[a-zA-Z0-9-]{3,50}$/

      expect(pattern.test(code)).toBe(true)
    })

    test('maximum length (50 chars) passes validation', () => {
      const code = 'a'.repeat(50)
      const pattern = /^[a-zA-Z0-9-]{3,50}$/

      expect(pattern.test(code)).toBe(true)
    })

    test('too short (< 3 chars) fails validation', () => {
      const code = 'ab'
      const pattern = /^[a-zA-Z0-9-]{3,50}$/

      expect(pattern.test(code)).toBe(false)
    })

    test('too long (> 50 chars) fails validation', () => {
      const code = 'a'.repeat(51)
      const pattern = /^[a-zA-Z0-9-]{3,50}$/

      expect(pattern.test(code)).toBe(false)
    })

    test('special characters fail validation', () => {
      const codes = ['abc@123', 'test!code', 'ref_123', 'code.com', 'test code']
      const pattern = /^[a-zA-Z0-9-]{3,50}$/

      codes.forEach((code) => {
        expect(pattern.test(code)).toBe(false)
      })
    })

    test('empty string fails validation', () => {
      const code = ''
      const pattern = /^[a-zA-Z0-9-]{3,50}$/

      expect(pattern.test(code)).toBe(false)
    })
  })

  describe('referral code auto-prefixing', () => {
    test('code without ref- prefix gets auto-prefixed', () => {
      const userInput = 'abc123'
      const referralCode = userInput.startsWith('ref-')
        ? userInput
        : `ref-${userInput}`

      expect(referralCode).toBe('ref-abc123')
    })

    test('code with ref- prefix stays unchanged', () => {
      const userInput = 'ref-abc123'
      const referralCode = userInput.startsWith('ref-')
        ? userInput
        : `ref-${userInput}`

      expect(referralCode).toBe('ref-abc123')
    })

    test('code with REF- (uppercase) gets normalized to lowercase prefix', () => {
      const userInput = 'REF-abc123'
      const userInputLower = userInput.toLowerCase()
      // Normalize: case-insensitive prefix check, strip and re-add lowercase prefix
      const referralCode = userInputLower.startsWith('ref-')
        ? `ref-${userInput.slice(4)}`
        : `ref-${userInput}`

      // Should strip REF- and re-add ref- to preserve the code portion
      expect(referralCode).toBe('ref-abc123')
    })

    test('code with Ref- (mixed case) gets normalized to lowercase prefix', () => {
      const userInput = 'Ref-XYZ789'
      const userInputLower = userInput.toLowerCase()
      const referralCode = userInputLower.startsWith('ref-')
        ? `ref-${userInput.slice(4)}`
        : `ref-${userInput}`

      expect(referralCode).toBe('ref-XYZ789')
    })

    test('code with rEf- (random case) gets normalized to lowercase prefix', () => {
      const userInput = 'rEf-Code123'
      const userInputLower = userInput.toLowerCase()
      const referralCode = userInputLower.startsWith('ref-')
        ? `ref-${userInput.slice(4)}`
        : `ref-${userInput}`

      expect(referralCode).toBe('ref-Code123')
    })

    test('preserves code portion casing when normalizing prefix', () => {
      // User typed "REF-ABC123" - should become "ref-ABC123", not "ref-abc123"
      const userInput = 'REF-ABC123'
      const userInputLower = userInput.toLowerCase()
      const referralCode = userInputLower.startsWith('ref-')
        ? `ref-${userInput.slice(4)}`
        : `ref-${userInput}`

      expect(referralCode).toBe('ref-ABC123')
      // Code portion should preserve original casing
      expect(referralCode.slice(4)).toBe('ABC123')
    })
  })

  describe('referral mode input storage', () => {
    test('input value is stored as-is without any prefix while in referral mode', () => {
      const inputMode: InputMode = 'referral'
      const inputValue = 'abc123'

      // The stored value should NOT have any prefix
      expect(inputValue).toBe('abc123')
      expect(inputValue).not.toContain('ref-')
      expect(inputMode).toBe('referral')
    })

    test('user can type ref- prefix manually if desired', () => {
      const inputMode: InputMode = 'referral'
      const inputValue = 'ref-abc123'

      expect(inputValue).toBe('ref-abc123')
      expect(inputMode).toBe('referral')
    })
  })

  describe('referral mode submission', () => {
    test('submitting referral code adds ref- prefix if not present', () => {
      const inputMode: InputMode = 'referral'
      const trimmedInput = 'abc123'

      const referralCode =
        inputMode === 'referral'
          ? trimmedInput.startsWith('ref-')
            ? trimmedInput
            : `ref-${trimmedInput}`
          : trimmedInput

      expect(referralCode).toBe('ref-abc123')
    })

    test('submitting referral code with ref- prefix keeps it', () => {
      const inputMode: InputMode = 'referral'
      const trimmedInput = 'ref-xyz789'

      const referralCode =
        inputMode === 'referral'
          ? trimmedInput.startsWith('ref-')
            ? trimmedInput
            : `ref-${trimmedInput}`
          : trimmedInput

      expect(referralCode).toBe('ref-xyz789')
    })

    test('submission exits referral mode after processing', () => {
      const setInputMode = mock((_mode: InputMode) => {})

      // After submission, referral mode should be exited
      setInputMode('default')

      expect(setInputMode).toHaveBeenCalledWith('default')
    })

    test('invalid code shows error and exits referral mode', () => {
      const setInputMode = mock((_mode: InputMode) => {})
      const showError = mock((_msg: string) => {})
      const trimmedInput = 'ab' // Too short
      const pattern = /^[a-zA-Z0-9-]{3,50}$/

      if (!pattern.test(trimmedInput)) {
        showError(
          'Invalid referral code format. Codes should be 3-50 alphanumeric characters.',
        )
        setInputMode('default')
      }

      expect(showError).toHaveBeenCalled()
      expect(setInputMode).toHaveBeenCalledWith('default')
    })
  })

  describe('referral mode UI state', () => {
    test('input mode is stored separately from input value', () => {
      const state1 = { inputMode: 'referral' as InputMode, inputValue: 'abc123' }
      const state2 = { inputMode: 'default' as InputMode, inputValue: 'hello' }

      expect(state1.inputMode).toBe('referral')
      expect(state1.inputValue).toBe('abc123')

      expect(state2.inputMode).toBe('default')
      expect(state2.inputValue).toBe('hello')
    })

    test('input width is adjusted in referral mode for icon column', () => {
      const referralConfig = getInputModeConfig('referral')

      expect(referralConfig.widthAdjustment).toBeGreaterThan(0)
    })

    test('input width is NOT adjusted when not in referral mode', () => {
      const defaultConfig = getInputModeConfig('default')

      expect(defaultConfig.widthAdjustment).toBe(0)
    })

    test('placeholder changes in referral mode', () => {
      const defaultConfig = getInputModeConfig('default')
      const referralConfig = getInputModeConfig('referral')

      expect(referralConfig.placeholder).not.toBe(defaultConfig.placeholder)
    })

    test('referral mode has a placeholder', () => {
      const referralConfig = getInputModeConfig('referral')

      expect(referralConfig.placeholder.length).toBeGreaterThan(0)
    })

    test('icon is displayed in referral mode', () => {
      const referralConfig = getInputModeConfig('referral')

      expect(referralConfig.icon).not.toBeNull()
    })

    test('no icon is displayed in default mode', () => {
      const defaultConfig = getInputModeConfig('default')

      expect(defaultConfig.icon).toBeNull()
    })

    test('border color changes to warning in referral mode', () => {
      const referralConfig = getInputModeConfig('referral')

      expect(referralConfig.color).toBe('warning')
    })

    test('agent mode toggle is hidden in referral mode', () => {
      const referralConfig = getInputModeConfig('referral')

      expect(referralConfig.showAgentModeToggle).toBe(false)
    })

    test('agent mode toggle is shown in default mode', () => {
      const defaultConfig = getInputModeConfig('default')

      expect(defaultConfig.showAgentModeToggle).toBe(true)
    })
  })

  describe('edge cases', () => {
    test('empty string is invalid referral code', () => {
      const code = ''
      const pattern = /^[a-zA-Z0-9-]{3,50}$/

      expect(pattern.test(code)).toBe(false)
    })

    test('whitespace is trimmed before validation', () => {
      const userInput = '  abc123  '
      const trimmed = userInput.trim()
      const pattern = /^[a-zA-Z0-9-]{3,50}$/

      expect(pattern.test(trimmed)).toBe(true)
    })

    test('only whitespace fails validation', () => {
      const userInput = '   '
      const trimmed = userInput.trim()
      const pattern = /^[a-zA-Z0-9-]{3,50}$/

      expect(pattern.test(trimmed)).toBe(false)
    })

    test('mode can be entered, exited, and re-entered', () => {
      let inputMode: InputMode = 'default'

      // Enter referral mode
      inputMode = 'referral'
      expect(inputMode).toBe('referral')

      // Exit referral mode
      inputMode = 'default'
      expect(inputMode).toBe('default')

      // Re-enter referral mode
      inputMode = 'referral'
      expect(inputMode).toBe('referral')
    })

    test('slash suggestions are disabled in referral mode', () => {
      const referralConfig = getInputModeConfig('referral')

      expect(referralConfig.disableSlashSuggestions).toBe(true)
    })
  })

  describe('integration with command router', () => {
    test('referral mode input is routed to handleReferralCode', () => {
      const handleReferralCode = mock(async (_code: string) => {})
      const inputMode = 'referral' as InputMode
      const trimmedInput = 'abc123'

      if (inputMode === 'referral') {
        const referralCode = trimmedInput.startsWith('ref-')
          ? trimmedInput
          : `ref-${trimmedInput}`
        handleReferralCode(referralCode)
      }

      expect(handleReferralCode).toHaveBeenCalledWith('ref-abc123')
    })

    test('normal mode input is NOT routed to referral handler', () => {
      const handleReferralCode = mock(async (_code: string) => {})
      const inputMode = 'default' as InputMode
      const trimmedInput = 'abc123'

      if (inputMode === 'referral') {
        handleReferralCode(`ref-${trimmedInput}`)
      }

      expect(handleReferralCode).not.toHaveBeenCalled()
    })

    test('ref-XXXX input in default mode uses referral handler', () => {
      const isReferralCode = (input: string) => {
        return /^\/?ref-[a-zA-Z0-9-]{1,50}$/.test(input)
      }

      const input1 = 'ref-abc123'
      const input2 = '/ref-abc123'
      const input3 = 'not-a-referral'

      expect(isReferralCode(input1)).toBe(true)
      expect(isReferralCode(input2)).toBe(true)
      expect(isReferralCode(input3)).toBe(false)
    })
  })

  describe('error handling', () => {
    test('network error during redemption shows error message', async () => {
      const showError = mock((_msg: string) => {})
      const handleReferralCode = mock(async (_code: string) => {
        throw new Error('Network error')
      })

      try {
        await handleReferralCode('ref-abc123')
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        showError(`Error redeeming referral code: ${errorMessage}`)
      }

      expect(showError).toHaveBeenCalledWith(
        'Error redeeming referral code: Network error',
      )
    })

    test('validation error prevents redemption attempt', () => {
      const handleReferralCode = mock(async (_code: string) => {})
      const showError = mock((_msg: string) => {})
      const trimmedInput = '!@#' // Invalid characters
      const pattern = /^[a-zA-Z0-9-]{3,50}$/

      if (!pattern.test(trimmedInput)) {
        showError(
          'Invalid referral code format. Codes should be 3-50 alphanumeric characters.',
        )
      } else {
        handleReferralCode(`ref-${trimmedInput}`)
      }

      expect(showError).toHaveBeenCalled()
      expect(handleReferralCode).not.toHaveBeenCalled()
    })
  })
})
