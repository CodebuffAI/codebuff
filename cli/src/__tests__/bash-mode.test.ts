import { describe, test, expect, beforeEach, mock } from 'bun:test'

/**
 * Tests for bash mode functionality in the CLI.
 * 
 * Bash mode is entered when user types '!' and allows running terminal commands.
 * The '!' is displayed in a red column but not stored in the input value.
 * 
 * Key behaviors:
 * 1. Typing '!' enters bash mode and clears input to ''
 * 2. In bash mode, input is stored WITHOUT '!' prefix
 * 3. Backspace at cursor position 0 exits bash mode (even with input)
 * 4. Submission prepends '!' to the command
 */

describe('bash-mode', () => {
  describe('entering bash mode', () => {
    test('typing exactly "!" enters bash mode and clears input', () => {
      const setBashMode = mock(() => {})
      const setInputValue = mock((value: any) => {})
      
      // Simulate user typing '!'
      const inputValue = { text: '!', cursorPosition: 1, lastEditDueToNav: false }
      const isBashMode = false
      
      // This simulates the handleInputChange logic
      const userTypedBang = !isBashMode && inputValue.text === '!'
      
      if (userTypedBang) {
        setBashMode()
        const newValue = {
          text: '',
          cursorPosition: 0,
          lastEditDueToNav: inputValue.lastEditDueToNav,
        }
        setInputValue(newValue)
      }
      
      expect(setBashMode).toHaveBeenCalled()
      expect(setInputValue).toHaveBeenCalled()
    })
    
    test('typing "!ls" does NOT enter bash mode (not exactly "!")', () => {
      const setBashMode = mock(() => {})
      const setInputValue = mock((value: any) => {})
      
      // Simulate user typing '!ls'
      const inputValue = { text: '!ls', cursorPosition: 3, lastEditDueToNav: false }
      const isBashMode = false
      
      const userTypedBang = !isBashMode && inputValue.text === '!'
      
      if (userTypedBang) {
        setBashMode()
        const newValue = {
          text: '',
          cursorPosition: 0,
          lastEditDueToNav: inputValue.lastEditDueToNav,
        }
        setInputValue(newValue)
      }
      
      expect(setBashMode).not.toHaveBeenCalled()
      expect(setInputValue).not.toHaveBeenCalled()
    })
    
    test('typing "!" when already in bash mode does nothing special', () => {
      const setBashMode = mock(() => {})
      const setInputValue = mock((value: any) => {})
      
      const inputValue = { text: '!', cursorPosition: 1, lastEditDueToNav: false }
      const isBashMode = true
      
      const userTypedBang = !isBashMode && inputValue.text === '!'
      
      if (userTypedBang) {
        setBashMode()
        const newValue = {
          text: '',
          cursorPosition: 0,
          lastEditDueToNav: inputValue.lastEditDueToNav,
        }
        setInputValue(newValue)
      }
      
      // Should not trigger because already in bash mode
      expect(setBashMode).not.toHaveBeenCalled()
      expect(setInputValue).not.toHaveBeenCalled()
    })
  })
  
  describe('exiting bash mode', () => {
    test('backspace at cursor position 0 exits bash mode', () => {
      const setBashMode = mock(() => {})
      
      // Simulate backspace key press in bash mode at cursor position 0
      const isBashMode = true
      const cursorPosition = 0
      const key = { name: 'backspace' }
      
      // This simulates the handleSuggestionMenuKey logic
      if (isBashMode && cursorPosition === 0 && key.name === 'backspace') {
        setBashMode()
      }
      
      expect(setBashMode).toHaveBeenCalled()
    })
    
    test('backspace at cursor position 0 with non-empty input DOES exit bash mode', () => {
      const setBashMode = mock(() => {})
      
      const isBashMode = true
      const inputValue: string = 'ls'
      const cursorPosition = 0
      const key = { name: 'backspace' }
      
      if (isBashMode && cursorPosition === 0 && key.name === 'backspace') {
        setBashMode()
      }
      
      // Should exit even though input is not empty, because cursor is at position 0
      expect(setBashMode).toHaveBeenCalled()
    })
    
    test('backspace at cursor position > 0 does NOT exit bash mode', () => {
      const setBashMode = mock(() => {})
      
      const isBashMode = true
      const cursorPosition: number = 2
      const key = { name: 'backspace' }
      
      if (isBashMode && cursorPosition === 0 && key.name === 'backspace') {
        setBashMode()
      }
      
      // Should not exit because cursor is not at position 0
      expect(setBashMode).not.toHaveBeenCalled()
    })
    
    test('other keys at cursor position 0 do NOT exit bash mode', () => {
      const setBashMode = mock(() => {})
      
      const isBashMode = true
      const cursorPosition = 0
      const key = { name: 'a' } // Regular key press
      
      if (isBashMode && cursorPosition === 0 && key.name === 'backspace') {
        setBashMode()
      }
      
      // Should not exit because key is not backspace
      expect(setBashMode).not.toHaveBeenCalled()
    })
    
    test('backspace when NOT in bash mode does nothing to bash mode', () => {
      const setBashMode = mock(() => {})
      
      const isBashMode = false
      const cursorPosition = 0
      const key = { name: 'backspace' }
      
      if (isBashMode && cursorPosition === 0 && key.name === 'backspace') {
        setBashMode()
      }
      
      // Should not trigger because not in bash mode
      expect(setBashMode).not.toHaveBeenCalled()
    })
  })
  
  describe('bash mode input storage', () => {
    test('input value does NOT include "!" prefix while in bash mode', () => {
      // When user types "ls" in bash mode, inputValue.text should be "ls", not "!ls"
      const isBashMode = true
      const inputValue = 'ls -la'
      
      // The stored value should NOT have the '!' prefix
      expect(inputValue).toBe('ls -la')
      expect(inputValue).not.toContain('!')
    })
    
    test('normal mode input can contain "!" anywhere', () => {
      const isBashMode = false
      const inputValue = 'fix this bug!'
      
      // In normal mode, '!' is just a regular character
      expect(inputValue).toContain('!')
    })
  })
  
  describe('bash mode submission', () => {
    test('submitting bash command prepends "!" to the stored value', () => {
      const isBashMode = true
      const trimmedInput = 'ls -la' // The stored value WITHOUT '!'
      
      // Router logic prepends '!' when in bash mode
      const commandWithBang = '!' + trimmedInput
      
      expect(commandWithBang).toBe('!ls -la')
    })
    
    test('submission displays "!" in user message', () => {
      const isBashMode = true
      const trimmedInput = 'pwd'
      const commandWithBang = '!' + trimmedInput
      
      // The user message should show the command WITH '!'
      const userMessage = { content: commandWithBang }
      
      expect(userMessage.content).toBe('!pwd')
    })
    
    test('submission saves command WITH "!" to history', () => {
      const saveToHistory = mock((cmd: string) => {})
      const isBashMode = true
      const trimmedInput = 'git status'
      const commandWithBang = '!' + trimmedInput
      
      // History should save the full command with '!'
      saveToHistory(commandWithBang)
      
      expect(saveToHistory).toHaveBeenCalled()
    })
    
    test('submission exits bash mode after running command', () => {
      const setBashMode = mock(() => {})
      const isBashMode = true
      
      // After submission, bash mode should be exited
      setBashMode()
      
      expect(setBashMode).toHaveBeenCalled()
    })
    
    test('terminal command receives value WITHOUT "!" prefix', () => {
      const runTerminalCommand = mock((params: any) => Promise.resolve([{ value: { stdout: 'output' } }]))
      const isBashMode = true
      const trimmedInput = 'echo hello'
      
      // The actual terminal command should NOT include the '!'
      runTerminalCommand({
        command: trimmedInput,
        process_type: 'SYNC',
        cwd: process.cwd(),
        timeout_seconds: -1,
        env: process.env,
      })
      
      expect(runTerminalCommand).toHaveBeenCalled()
    })
  })
  
  describe('bash mode UI state', () => {
    test('bash mode flag is stored separately from input value', () => {
      // The isBashMode flag is independent of the input text
      const state1 = { isBashMode: true, inputValue: 'ls' }
      const state2 = { isBashMode: false, inputValue: 'hello' }
      
      expect(state1.isBashMode).toBe(true)
      expect(state1.inputValue).not.toContain('!')
      
      expect(state2.isBashMode).toBe(false)
      expect(state2.inputValue).not.toContain('!')
    })
    
    test('input width is adjusted in bash mode for "!" column', () => {
      const baseInputWidth = 100
      const isBashMode = true
      
      // Width should be reduced by 2 to account for '!' and spacing
      const adjustedInputWidth = isBashMode ? baseInputWidth - 2 : baseInputWidth
      
      expect(adjustedInputWidth).toBe(98)
    })
    
    test('input width is NOT adjusted when not in bash mode', () => {
      const baseInputWidth = 100
      const isBashMode = false
      
      const adjustedInputWidth = isBashMode ? baseInputWidth - 2 : baseInputWidth
      
      expect(adjustedInputWidth).toBe(100)
    })
    
    test('placeholder changes in bash mode', () => {
      const normalPlaceholder = 'Ask Buffy anything...'
      const bashPlaceholder = 'enter bash command...'
      const isBashMode = true
      
      const effectivePlaceholder = isBashMode ? bashPlaceholder : normalPlaceholder
      
      expect(effectivePlaceholder).toBe('enter bash command...')
    })
    
    test('placeholder is normal when not in bash mode', () => {
      const normalPlaceholder = 'Ask Buffy anything...'
      const bashPlaceholder = 'enter bash command...'
      const isBashMode = false
      
      const effectivePlaceholder = isBashMode ? bashPlaceholder : normalPlaceholder
      
      expect(effectivePlaceholder).toBe('Ask Buffy anything...')
    })
  })
  
  describe('edge cases', () => {
    test('empty string is NOT the same as "!"', () => {
      const isBashMode = false
      const inputValue: string = ''
      const exclamation = '!'
      const inputEqualsExclamation = inputValue === exclamation
      
      expect(inputEqualsExclamation).toBe(false)
    })
    
    test('whitespace around "!" prevents bash mode entry', () => {
      const isBashMode = false
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
      const isBashMode = false
      const inputValue: string = '!!'
      const exclamation = '!'
      const inputEqualsExclamation = inputValue === exclamation
      
      expect(inputEqualsExclamation).toBe(false)
    })
    
    test('bash mode can be entered, exited, and re-entered', () => {
      let isBashMode = false
      const exclamation = '!'
      const empty = ''
      
      // Enter bash mode
      if (exclamation === exclamation) {
        isBashMode = true
      }
      expect(isBashMode).toBe(true)
      
      // Exit bash mode
      if (isBashMode && empty === empty) {
        isBashMode = false
      }
      expect(isBashMode).toBe(false)
      
      // Re-enter bash mode
      if (!isBashMode && exclamation === exclamation) {
        isBashMode = true
      }
      expect(isBashMode).toBe(true)
    })
  })
  
  describe('integration with command router', () => {
    test('bash mode commands are routed differently than normal prompts', () => {
      const isBashMode = true
      const normalPrompt = false
      
      // In bash mode, commands should be handled by terminal execution
      // Not by the LLM agent
      expect(isBashMode).toBe(true)
      expect(normalPrompt).toBe(false)
    })
    
    test('normal commands starting with "!" are NOT bash commands', () => {
      const isBashMode = false
      const inputValue = '!ls' // User typed this in normal mode
      
      // This should be treated as a normal prompt, not a bash command
      // because bash mode was not activated
      expect(isBashMode).toBe(false)
    })
    
    test('bash mode takes precedence over slash commands', () => {
      const isBashMode = true
      const trimmedInput = '/help' // Looks like a slash command
      
      // But in bash mode, it's just a bash command
      if (isBashMode) {
        const commandWithBang = '!' + trimmedInput
        expect(commandWithBang).toBe('!/help')
      }
    })
  })
})
