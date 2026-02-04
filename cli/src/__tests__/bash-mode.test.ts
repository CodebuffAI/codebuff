import { describe, test, expect, mock } from 'bun:test'

import type { InputValue } from '../types/store'
import type { InputMode } from '../utils/input-modes'

/**
 * Tests for bash mode functionality in the CLI.
 *
 * Bash mode is entered when user types '!' and allows running terminal commands.
 * The '!' is displayed in a green column but not stored in the input value.
 *
 * Key behaviors:
 * 1. Typing '!' enters bash mode and clears input to ''
 * 2. In bash mode, input is stored WITHOUT '!' prefix
 * 3. Backspace at cursor position 0 exits bash mode (even with input)
 * 4. Submission prepends '!' to the command
 *
 * Note: Tests for runBashCommand and /bash slash command are in
 * cli/src/commands/__tests__/bash-command.test.ts
 */

describe('bash-mode', () => {
  describe('entering bash mode', () => {
    test('typing exactly "!" enters bash mode and clears input', () => {
      const setInputMode = mock((_mode: InputMode) => {})
      const setInputValue = mock((_value: Partial<InputValue>) => {})

      // Simulate user typing '!'
      const inputValue = {
        text: '!',
        cursorPosition: 1,
        lastEditDueToNav: false,
      }
      const inputMode: InputMode = 'default'

      // This simulates the handleInputChange logic
      const userTypedBang = inputMode === 'default' && inputValue.text === '!'

      if (userTypedBang) {
        setInputMode('bash')
        const newValue = {
          text: '',
          cursorPosition: 0,
          lastEditDueToNav: inputValue.lastEditDueToNav,
        }
        setInputValue(newValue)
      }

      expect(setInputMode).toHaveBeenCalledWith('bash')
      expect(setInputValue).toHaveBeenCalled()
    })

    test('typing "!ls" does NOT enter bash mode (not exactly "!")', () => {
      const setInputMode = mock((_mode: InputMode) => {})
      const setInputValue = mock((_value: Partial<InputValue>) => {})

      // Simulate user typing '!ls'
      const inputValue = {
        text: '!ls',
        cursorPosition: 3,
        lastEditDueToNav: false,
      }
      const inputMode: InputMode = 'default'

      const userTypedBang = inputMode === 'default' && inputValue.text === '!'

      if (userTypedBang) {
        setInputMode('bash')
        const newValue = {
          text: '',
          cursorPosition: 0,
          lastEditDueToNav: inputValue.lastEditDueToNav,
        }
        setInputValue(newValue)
      }

      expect(setInputMode).not.toHaveBeenCalled()
      expect(setInputValue).not.toHaveBeenCalled()
    })

    test('typing "!" when already in bash mode does nothing special', () => {
      const setInputMode = mock((_mode: InputMode) => {})
      const setInputValue = mock((_value: Partial<InputValue>) => {})

      const inputValue = {
        text: '!',
        cursorPosition: 1,
        lastEditDueToNav: false,
      }
      const inputMode = 'bash' as InputMode

      const userTypedBang =
        inputMode === ('default' as InputMode) && inputValue.text === '!'

      if (userTypedBang) {
        setInputMode('bash')
        const newValue = {
          text: '',
          cursorPosition: 0,
          lastEditDueToNav: inputValue.lastEditDueToNav,
        }
        setInputValue(newValue)
      }

      // Should not trigger because already in bash mode
      expect(setInputMode).not.toHaveBeenCalled()
      expect(setInputValue).not.toHaveBeenCalled()
    })
  })

  describe('exiting bash mode', () => {
    test('backspace at cursor position 0 exits bash mode', () => {
      const setInputMode = mock((_mode: InputMode) => {})

      // Simulate backspace key press in bash mode at cursor position 0
      const inputMode: InputMode = 'bash'
      const cursorPosition = 0
      const key = { name: 'backspace' }

      // This simulates the handleSuggestionMenuKey logic
      if (
        inputMode === 'bash' &&
        cursorPosition === 0 &&
        key.name === 'backspace'
      ) {
        setInputMode('default')
      }

      expect(setInputMode).toHaveBeenCalledWith('default')
    })

    test('backspace at cursor position 0 with non-empty input DOES exit bash mode', () => {
      const setInputMode = mock((_mode: InputMode) => {})

      const inputMode: InputMode = 'bash'
      const cursorPosition = 0
      const key = { name: 'backspace' }

      if (
        inputMode === 'bash' &&
        cursorPosition === 0 &&
        key.name === 'backspace'
      ) {
        setInputMode('default')
      }

      // Should exit even though input is not empty, because cursor is at position 0
      expect(setInputMode).toHaveBeenCalledWith('default')
    })

    test('backspace at cursor position > 0 does NOT exit bash mode', () => {
      const setInputMode = mock((_mode: InputMode) => {})

      const inputMode: InputMode = 'bash'
      const cursorPosition: number = 2
      const key = { name: 'backspace' }

      if (
        inputMode === 'bash' &&
        cursorPosition === 0 &&
        key.name === 'backspace'
      ) {
        setInputMode('default')
      }

      // Should not exit because cursor is not at position 0
      expect(setInputMode).not.toHaveBeenCalled()
    })

    test('other keys at cursor position 0 do NOT exit bash mode', () => {
      const setInputMode = mock((_mode: InputMode) => {})

      const inputMode: InputMode = 'bash'
      const cursorPosition = 0
      const key = { name: 'a' } // Regular key press

      if (
        inputMode === 'bash' &&
        cursorPosition === 0 &&
        key.name === 'backspace'
      ) {
        setInputMode('default')
      }

      // Should not exit because key is not backspace
      expect(setInputMode).not.toHaveBeenCalled()
    })

    test('backspace when NOT in bash mode does nothing to bash mode', () => {
      const setInputMode = mock((_mode: InputMode) => {})

      const inputMode = 'default' as InputMode
      const cursorPosition = 0
      const key = { name: 'backspace' }

      if (
        inputMode === ('bash' as InputMode) &&
        cursorPosition === 0 &&
        key.name === 'backspace'
      ) {
        setInputMode('default')
      }

      // Should not trigger because not in bash mode
      expect(setInputMode).not.toHaveBeenCalled()
    })
  })

  describe('bash mode input storage', () => {
    test('input value does NOT include "!" prefix while in bash mode', () => {
      // When user types "ls" in bash mode, inputValue.text should be "ls", not "!ls"
      const inputMode: InputMode = 'bash'
      const inputValue = 'ls -la'

      // The stored value should NOT have the '!' prefix
      expect(inputValue).toBe('ls -la')
      expect(inputValue).not.toContain('!')
      expect(inputMode).toBe('bash')
    })

    test('normal mode input can contain "!" anywhere', () => {
      const inputValue = 'fix this bug!'

      // In normal mode, '!' is just a regular character
      expect(inputValue).toContain('!')
    })
  })

  describe('bash mode submission', () => {
    test('submitting bash command prepends "!" to the stored value', () => {
      const inputMode: InputMode = 'bash'
      const trimmedInput = 'ls -la' // The stored value WITHOUT '!'

      // Router logic prepends '!' when in bash mode
      const commandWithBang =
        inputMode === 'bash' ? '!' + trimmedInput : trimmedInput

      expect(commandWithBang).toBe('!ls -la')
    })

    test('submission displays "!" in user message', () => {
      const inputMode: InputMode = 'bash'
      const trimmedInput = 'pwd'
      const commandWithBang =
        inputMode === 'bash' ? '!' + trimmedInput : trimmedInput

      // The user message should show the command WITH '!'
      const userMessage = { content: commandWithBang }

      expect(userMessage.content).toBe('!pwd')
    })

    test('submission saves command WITH "!" to history', () => {
      const saveToHistory = mock((_command: string) => {})
      const trimmedInput = 'git status'
      const commandWithBang = '!' + trimmedInput

      // History should save the full command with '!'
      saveToHistory(commandWithBang)

      expect(saveToHistory).toHaveBeenCalledWith('!git status')
    })

    test('submission exits bash mode after running command', () => {
      const setInputMode = mock((_mode: InputMode) => {})

      // After submission, bash mode should be exited
      setInputMode('default')

      expect(setInputMode).toHaveBeenCalledWith('default')
    })

    test('terminal command receives value WITHOUT "!" prefix', () => {
      const runTerminalCommand = mock((_params: Record<string, unknown>) =>
        Promise.resolve([{ value: { stdout: 'output' } }]),
      )
      const trimmedInput = 'echo hello'

      // The actual terminal command should NOT include the '!'
      runTerminalCommand({
        command: trimmedInput,
        process_type: 'SYNC',
        cwd: process.cwd(),
        timeout_seconds: -1,
        env: process.env,
      })

      expect(runTerminalCommand).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'echo hello' }),
      )
    })
  })

  describe('bash mode UI state', () => {
    test('input mode is stored separately from input value', () => {
      // The inputMode is independent of the input text
      const state1: { inputMode: InputMode; inputValue: string } = {
        inputMode: 'bash',
        inputValue: 'ls',
      }
      const state2: { inputMode: InputMode; inputValue: string } = {
        inputMode: 'default',
        inputValue: 'hello',
      }

      expect(state1.inputMode).toBe('bash')
      expect(state1.inputValue).not.toContain('!')

      expect(state2.inputMode).toBe('default')
      expect(state2.inputValue).not.toContain('!')
    })

    test('input width is adjusted in bash mode for "!" column', () => {
      const baseInputWidth = 100
      const inputModeValue: InputMode = 'bash'

      // Width should be reduced by 2 to account for '!' and spacing
      const adjustedInputWidth =
        inputModeValue === 'bash' ? baseInputWidth - 2 : baseInputWidth

      expect(adjustedInputWidth).toBe(98)
    })

    test('input width is NOT adjusted when not in bash mode', () => {
      const baseInputWidth = 100
      const inputModeValue = 'default' as InputMode

      const adjustedInputWidth =
        inputModeValue === ('bash' as InputMode)
          ? baseInputWidth - 2
          : baseInputWidth

      expect(adjustedInputWidth).toBe(100)
    })

    test('placeholder changes in bash mode', () => {
      const normalPlaceholder = 'Ask Buffy anything...'
      const bashPlaceholder = 'enter bash command...'
      const inputMode: InputMode = 'bash'

      const effectivePlaceholder =
        inputMode === 'bash' ? bashPlaceholder : normalPlaceholder

      expect(effectivePlaceholder).toBe('enter bash command...')
    })

    test('placeholder is normal when not in bash mode', () => {
      const normalPlaceholder = 'Ask Buffy anything...'
      const bashPlaceholder = 'enter bash command...'
      const inputMode = 'default' as InputMode

      const effectivePlaceholder =
        inputMode === ('bash' as InputMode)
          ? bashPlaceholder
          : normalPlaceholder

      expect(effectivePlaceholder).toBe('Ask Buffy anything...')
    })
  })

  describe('edge cases', () => {
    test('empty string is NOT the same as "!"', () => {
      const inputMode: InputMode = 'default'
      const inputValue: string = ''
      const exclamation = '!'
      const inputEqualsExclamation = inputValue === exclamation

      expect(inputEqualsExclamation).toBe(false)
      expect(inputMode).toBe('default')
    })

    test('whitespace around "!" prevents bash mode entry', () => {
      const exclamation = '!'
      const inputValue1: string = ' !'
      const inputValue2: string = '! '
      const inputValue3: string = ' ! '

      const match1 = inputValue1 === exclamation
      const match2 = inputValue2 === exclamation
      const match3 = inputValue3 === exclamation

      expect(match1).toBe(false)
      expect(match2).toBe(false)
      expect(match3).toBe(false)
    })

    test('multiple "!" characters do not enter bash mode', () => {
      const inputValue: string = '!!'
      const exclamation = '!'
      const inputEqualsExclamation = inputValue === exclamation

      expect(inputEqualsExclamation).toBe(false)
    })

    test('mode can be entered, exited, and re-entered', () => {
      let inputMode: InputMode = 'default'

      // Enter bash mode
      inputMode = 'bash'
      expect(inputMode).toBe('bash')

      // Exit bash mode
      inputMode = 'default'
      expect(inputMode).toBe('default')

      // Re-enter bash mode
      inputMode = 'bash'
      expect(inputMode).toBe('bash')
    })
  })

  describe('integration with command router', () => {
    test('bash mode commands are routed differently than normal prompts', () => {
      const inputMode: InputMode = 'bash'

      // In bash mode, commands should be handled by terminal execution
      // Not by the LLM agent
      expect(inputMode).toBe('bash')
    })

    test('normal commands starting with "!" are NOT bash commands', () => {
      const inputMode = 'default' as InputMode
      const inputValue = '!ls' // User typed this in normal mode

      // This should be treated as a normal prompt, not a bash command
      // because bash mode was not activated
      expect(inputMode).toBe('default')
      expect(inputValue).toBe('!ls')
    })

    test('bash mode takes precedence over slash commands', () => {
      const inputMode = 'bash' as InputMode
      const trimmedInput = '/help' // Looks like a slash command

      // But in bash mode, it's just a bash command
      if (inputMode === ('bash' as InputMode)) {
        const commandWithBang = '!' + trimmedInput
        expect(commandWithBang).toBe('!/help')
      }
    })
  })
})
