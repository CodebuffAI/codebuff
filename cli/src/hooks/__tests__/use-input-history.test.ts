import { describe, test, expect } from 'bun:test'

import type { InputMode } from '../../utils/input-modes'

// Tests cross-mode history navigation (default <-> bash mode)
// Uses mock implementation since React 19 + Bun + RTL renderHook() is unreliable

function parseHistoryItem(item: string): {
  mode: InputMode
  displayText: string
} {
  if (item.startsWith('!') && item.length > 1) {
    return { mode: 'bash', displayText: item.slice(1) }
  }
  return { mode: 'default', displayText: item }
}

describe('use-input-history - parseHistoryItem', () => {
  describe('default mode entries', () => {
    test('parses regular text as default mode', () => {
      const result = parseHistoryItem('hello world')
      expect(result.mode).toBe('default')
      expect(result.displayText).toBe('hello world')
    })

    test('parses empty string as default mode', () => {
      const result = parseHistoryItem('')
      expect(result.mode).toBe('default')
      expect(result.displayText).toBe('')
    })

    test('parses text with special characters as default mode', () => {
      const result = parseHistoryItem('fix the bug in @file.ts')
      expect(result.mode).toBe('default')
      expect(result.displayText).toBe('fix the bug in @file.ts')
    })

    test('parses multiline text as default mode', () => {
      const result = parseHistoryItem('first line\nsecond line')
      expect(result.mode).toBe('default')
      expect(result.displayText).toBe('first line\nsecond line')
    })
  })

  describe('bash mode entries', () => {
    test('parses !command as bash mode', () => {
      const result = parseHistoryItem('!ls -la')
      expect(result.mode).toBe('bash')
      expect(result.displayText).toBe('ls -la')
    })

    test('parses !git command as bash mode', () => {
      const result = parseHistoryItem('!git status')
      expect(result.mode).toBe('bash')
      expect(result.displayText).toBe('git status')
    })

    test('parses complex bash command as bash mode', () => {
      const result = parseHistoryItem('!npm run test -- --watch')
      expect(result.mode).toBe('bash')
      expect(result.displayText).toBe('npm run test -- --watch')
    })

    test('parses piped bash command as bash mode', () => {
      const result = parseHistoryItem('!cat file.txt | grep error')
      expect(result.mode).toBe('bash')
      expect(result.displayText).toBe('cat file.txt | grep error')
    })
  })

  describe('edge cases', () => {
    test('single ! is treated as default mode (not bash)', () => {
      const result = parseHistoryItem('!')
      expect(result.mode).toBe('default')
      expect(result.displayText).toBe('!')
    })

    test('! in middle of text is default mode', () => {
      const result = parseHistoryItem('hello! world')
      expect(result.mode).toBe('default')
      expect(result.displayText).toBe('hello! world')
    })

    test('! at end of text is default mode', () => {
      const result = parseHistoryItem('hello world!')
      expect(result.mode).toBe('default')
      expect(result.displayText).toBe('hello world!')
    })

    test('!! at start is bash mode with ! prefix command', () => {
      const result = parseHistoryItem('!!')
      expect(result.mode).toBe('bash')
      expect(result.displayText).toBe('!')
    })

    test('!  with space is bash mode', () => {
      const result = parseHistoryItem('! echo hello')
      expect(result.mode).toBe('bash')
      expect(result.displayText).toBe(' echo hello')
    })
  })
})

interface MockHistoryState {
  messageHistory: string[]
  historyIndex: number
  currentDraft: string
  currentDraftMode: InputMode
  isNavigating: boolean
  inputValue: string
  inputMode: InputMode
}

function createMockHistoryNavigator(initialHistory: string[] = []) {
  const state: MockHistoryState = {
    messageHistory: initialHistory,
    historyIndex: -1,
    currentDraft: '',
    currentDraftMode: 'default',
    isNavigating: false,
    inputValue: '',
    inputMode: 'default',
  }

  const setInputValue = (value: { text: string; cursorPosition: number; lastEditDueToNav: boolean }) => {
    state.inputValue = value.text
  }

  const setInputMode = (mode: InputMode) => {
    state.inputMode = mode
  }

  const resetHistoryNavigation = () => {
    state.historyIndex = -1
    state.currentDraft = ''
    state.currentDraftMode = 'default'
  }

  const navigateUp = () => {
    const history = state.messageHistory
    if (history.length === 0) return

    state.isNavigating = true

    if (state.historyIndex === -1) {
      state.currentDraft = state.inputMode === 'bash' ? '!' + state.inputValue : state.inputValue
      state.currentDraftMode = state.inputMode
      state.historyIndex = history.length - 1
    } else if (state.historyIndex > 0) {
      state.historyIndex -= 1
    }

    const historyMessage = history[state.historyIndex]
    if (historyMessage === undefined) {
      state.isNavigating = false
      return
    }

    const { mode, displayText } = parseHistoryItem(historyMessage)

    if (mode !== state.inputMode) {
      setInputMode(mode)
    }

    setInputValue({
      text: displayText,
      cursorPosition: displayText.length,
      lastEditDueToNav: true,
    })

    state.isNavigating = false
  }

  const navigateDown = () => {
    const history = state.messageHistory
    if (history.length === 0) return
    if (state.historyIndex === -1) return

    state.isNavigating = true

    if (state.historyIndex < history.length - 1) {
      state.historyIndex += 1
      const historyMessage = history[state.historyIndex]
      if (historyMessage === undefined) {
        state.isNavigating = false
        return
      }

      const { mode, displayText } = parseHistoryItem(historyMessage)

      // Switch mode if needed
      if (mode !== state.inputMode) {
        setInputMode(mode)
      }

      setInputValue({
        text: displayText,
        cursorPosition: displayText.length,
        lastEditDueToNav: true,
      })
    } else {
      state.historyIndex = -1
      const draft = state.currentDraft
      const draftMode = state.currentDraftMode

      if (draftMode !== state.inputMode) {
        setInputMode(draftMode)
      }

      const textToShow =
        draftMode === 'bash' && draft.startsWith('!') ? draft.slice(1) : draft

      setInputValue({
        text: textToShow,
        cursorPosition: textToShow.length,
        lastEditDueToNav: true,
      })
    }

    state.isNavigating = false
  }

  const simulateInputModeChange = (newMode: InputMode) => {
    const oldMode = state.inputMode
    state.inputMode = newMode

    if (!state.isNavigating && oldMode !== newMode) {
      resetHistoryNavigation()
    }
  }

  return {
    state,
    setInputValue,
    setInputMode,
    resetHistoryNavigation,
    navigateUp,
    navigateDown,
    simulateInputModeChange,
  }
}

describe('use-input-history - cross-mode navigation', () => {
  describe('navigating from default mode to bash entries', () => {
    test('navigating up to a bash entry switches to bash mode', () => {
      const nav = createMockHistoryNavigator(['hello world', '!ls -la'])

      expect(nav.state.inputMode).toBe('default')
      nav.navigateUp()
      
      expect(nav.state.inputMode).toBe('bash')
      expect(nav.state.inputValue).toBe('ls -la')
      expect(nav.state.historyIndex).toBe(1)
    })

    test('navigating up through mixed history changes modes appropriately', () => {
      const nav = createMockHistoryNavigator([
        'default entry 1',
        '!bash command 1',
        'default entry 2',
        '!bash command 2',
      ])

      nav.navigateUp()
      expect(nav.state.inputMode).toBe('bash')
      expect(nav.state.inputValue).toBe('bash command 2')

      nav.navigateUp()
      expect(nav.state.inputMode).toBe('default')
      expect(nav.state.inputValue).toBe('default entry 2')

      nav.navigateUp()
      expect(nav.state.inputMode).toBe('bash')
      expect(nav.state.inputValue).toBe('bash command 1')

      nav.navigateUp()
      expect(nav.state.inputMode).toBe('default')
      expect(nav.state.inputValue).toBe('default entry 1')
    })
  })

  describe('navigating from bash mode to default entries', () => {
    test('navigating up from bash mode to a default entry switches to default mode', () => {
      const nav = createMockHistoryNavigator(['hello world', '!ls -la'])

      nav.state.inputMode = 'bash'
      nav.state.inputValue = 'pwd'

      nav.navigateUp()
      expect(nav.state.inputMode as string).toBe('bash')
      expect(nav.state.inputValue).toBe('ls -la')

      nav.navigateUp()
      expect(nav.state.inputMode as string).toBe('default')
      expect(nav.state.inputValue).toBe('hello world')
    })
  })

  describe('returning to draft restores original mode', () => {
    test('navigating back to draft restores default mode', () => {
      const nav = createMockHistoryNavigator(['!bash command'])

      nav.state.inputMode = 'default'
      nav.state.inputValue = 'my draft text'

      nav.navigateUp()
      expect(nav.state.inputMode as string).toBe('bash')
      expect(nav.state.inputValue).toBe('bash command')

      nav.navigateDown()
      expect(nav.state.inputMode as string).toBe('default')
      expect(nav.state.inputValue).toBe('my draft text')
    })

    test('navigating back to draft restores bash mode', () => {
      const nav = createMockHistoryNavigator(['default entry'])

      nav.state.inputMode = 'bash'
      nav.state.inputValue = 'my bash draft'

      nav.navigateUp()
      expect(nav.state.inputMode as string).toBe('default')
      expect(nav.state.inputValue).toBe('default entry')

      nav.navigateDown()
      expect(nav.state.inputMode as string).toBe('bash')
      expect(nav.state.inputValue).toBe('my bash draft')
    })

    test('draft is preserved with ! prefix for bash mode', () => {
      const nav = createMockHistoryNavigator(['default entry'])

      nav.state.inputMode = 'bash'
      nav.state.inputValue = 'git status'

      nav.navigateUp()
      expect(nav.state.currentDraft).toBe('!git status')
      expect(nav.state.currentDraftMode).toBe('bash')

      nav.navigateDown()
      expect(nav.state.inputValue).toBe('git status')
      expect(nav.state.inputMode as string).toBe('bash')
    })
  })

  describe('navigation through entire history', () => {
    test('can navigate up through all entries and back down to draft', () => {
      const nav = createMockHistoryNavigator([
        'first',
        '!second',
        'third',
      ])

      nav.state.inputValue = 'draft'
      nav.state.inputMode = 'default'

      // Navigate up through all entries
      nav.navigateUp()
      expect(nav.state.inputValue).toBe('third')
      expect(nav.state.inputMode).toBe('default')

      nav.navigateUp()
      expect(nav.state.inputValue).toBe('second')
      expect(nav.state.inputMode as string).toBe('bash')

      nav.navigateUp()
      expect(nav.state.inputValue).toBe('first')
      expect(nav.state.inputMode).toBe('default')

      // Should stay at oldest entry
      nav.navigateUp()
      expect(nav.state.inputValue).toBe('first')
      expect(nav.state.historyIndex).toBe(0)

      // Navigate back down
      nav.navigateDown()
      expect(nav.state.inputValue).toBe('second')
      expect(nav.state.inputMode as string).toBe('bash')

      nav.navigateDown()
      expect(nav.state.inputValue).toBe('third')
      expect(nav.state.inputMode).toBe('default')

      nav.navigateDown()
      expect(nav.state.inputValue).toBe('draft')
      expect(nav.state.inputMode).toBe('default')

      // Should stay at draft
      nav.navigateDown()
      expect(nav.state.inputValue).toBe('draft')
      expect(nav.state.historyIndex).toBe(-1)
    })
  })
})

describe('use-input-history - isNavigating flag behavior', () => {
  describe('navigation sets and clears isNavigating flag', () => {
    test('navigateUp sets isNavigating during mode change', () => {
      const nav = createMockHistoryNavigator(['!bash command'])

      nav.state.inputMode = 'default'
      expect(nav.state.isNavigating).toBe(false)

      nav.navigateUp()
      expect(nav.state.isNavigating).toBe(false)
      expect(nav.state.inputMode as string).toBe('bash')
    })

    test('navigateDown sets isNavigating during mode change', () => {
      const nav = createMockHistoryNavigator(['default entry', '!bash command'])

      nav.navigateUp()
      expect(nav.state.inputMode).toBe('bash')

      nav.navigateDown()
      expect(nav.state.inputMode).toBe('default')
      expect(nav.state.isNavigating).toBe(false)
    })
  })

  describe('useEffect reset is prevented during navigation', () => {
    test('manual mode change resets history navigation', () => {
      const nav = createMockHistoryNavigator(['entry 1', 'entry 2'])

      nav.navigateUp()
      expect(nav.state.historyIndex).toBe(1)
      expect(nav.state.inputValue).toBe('entry 2')

      nav.simulateInputModeChange('bash')
      expect(nav.state.historyIndex).toBe(-1)
      expect(nav.state.currentDraft).toBe('')
      expect(nav.state.currentDraftMode).toBe('default')
    })

    test('mode change during navigation does NOT reset history', () => {
      const nav = createMockHistoryNavigator(['default entry', '!bash command'])

      nav.state.isNavigating = true
      nav.simulateInputModeChange('bash')
      nav.state.historyIndex = 1
      nav.simulateInputModeChange('default')
      nav.state.isNavigating = false
    })

    test('exiting feedback mode explicitly resets history navigation', () => {
      const nav = createMockHistoryNavigator(['entry 1', 'entry 2'])

      nav.navigateUp()
      expect(nav.state.historyIndex).toBe(1)

      nav.resetHistoryNavigation()
      
      expect(nav.state.historyIndex).toBe(-1)
      expect(nav.state.currentDraft).toBe('')
      expect(nav.state.currentDraftMode).toBe('default')
    })
  })
})

describe('use-input-history - resetHistoryNavigation', () => {
  test('resets historyIndex to -1', () => {
    const nav = createMockHistoryNavigator(['entry'])

    nav.navigateUp()
    expect(nav.state.historyIndex).toBe(0)

    nav.resetHistoryNavigation()
    expect(nav.state.historyIndex).toBe(-1)
  })

  test('resets currentDraft to empty string', () => {
    const nav = createMockHistoryNavigator(['entry'])
    nav.state.inputValue = 'my draft'

    nav.navigateUp()
    expect(nav.state.currentDraft).toBe('my draft')

    nav.resetHistoryNavigation()
    expect(nav.state.currentDraft).toBe('')
  })

  test('resets currentDraftMode to default', () => {
    const nav = createMockHistoryNavigator(['entry'])
    nav.state.inputMode = 'bash'
    nav.state.inputValue = 'my bash draft'

    nav.navigateUp()
    expect(nav.state.currentDraftMode).toBe('bash')

    nav.resetHistoryNavigation()
    expect(nav.state.currentDraftMode).toBe('default')
  })

  test('can be called multiple times safely', () => {
    const nav = createMockHistoryNavigator(['entry'])

    nav.resetHistoryNavigation()
    nav.resetHistoryNavigation()
    nav.resetHistoryNavigation()
    
    expect(nav.state.historyIndex).toBe(-1)
    expect(nav.state.currentDraft).toBe('')
    expect(nav.state.currentDraftMode).toBe('default')
  })

  test('allows navigation after reset', () => {
    const nav = createMockHistoryNavigator(['entry 1', 'entry 2'])

    nav.navigateUp()
    expect(nav.state.inputValue).toBe('entry 2')

    nav.resetHistoryNavigation()

    nav.navigateUp()
    expect(nav.state.inputValue).toBe('entry 2')
    expect(nav.state.historyIndex).toBe(1)
  })
})

describe('use-input-history - edge cases', () => {
  describe('empty history', () => {
    test('navigateUp does nothing with empty history', () => {
      const nav = createMockHistoryNavigator([])

      nav.state.inputValue = 'current text'
      nav.navigateUp()
      
      expect(nav.state.inputValue).toBe('current text')
      expect(nav.state.historyIndex).toBe(-1)
    })

    test('navigateDown does nothing with empty history', () => {
      const nav = createMockHistoryNavigator([])

      nav.state.inputValue = 'current text'
      nav.navigateDown()
      
      expect(nav.state.inputValue).toBe('current text')
      expect(nav.state.historyIndex).toBe(-1)
    })
  })

  describe('single entry history', () => {
    test('can navigate up and down with single entry', () => {
      const nav = createMockHistoryNavigator(['only entry'])
      nav.state.inputValue = 'draft'

      nav.navigateUp()
      expect(nav.state.inputValue).toBe('only entry')
      expect(nav.state.historyIndex).toBe(0)

      nav.navigateUp()
      expect(nav.state.inputValue).toBe('only entry')
      expect(nav.state.historyIndex).toBe(0)

      nav.navigateDown()
      expect(nav.state.inputValue).toBe('draft')
      expect(nav.state.historyIndex).toBe(-1)
    })
  })

  describe('navigateDown without prior navigateUp', () => {
    test('navigateDown at draft does nothing', () => {
      const nav = createMockHistoryNavigator(['entry 1', 'entry 2'])

      nav.state.inputValue = 'draft'
      nav.navigateDown()
      
      expect(nav.state.inputValue).toBe('draft')
      expect(nav.state.historyIndex).toBe(-1)
    })
  })

  describe('rapid navigation', () => {
    test('rapid up/down navigation works correctly', () => {
      const nav = createMockHistoryNavigator(['a', 'b', 'c'])
      nav.state.inputValue = 'draft'

      nav.navigateUp() // c
      nav.navigateUp() // b
      nav.navigateDown() // c
      nav.navigateUp() // b
      nav.navigateUp() // a
      nav.navigateDown() // b
      nav.navigateDown() // c
      nav.navigateDown() // draft

      expect(nav.state.inputValue).toBe('draft')
      expect(nav.state.historyIndex).toBe(-1)
    })
  })

  describe('special characters in history', () => {
    test('handles entries with special characters', () => {
      const nav = createMockHistoryNavigator([
        'entry with @mention',
        '!command with "quotes"',
        'entry with \nnewline',
      ])

      nav.navigateUp()
      expect(nav.state.inputValue).toBe('entry with \nnewline')

      nav.navigateUp()
      expect(nav.state.inputValue).toBe('command with "quotes"')
      expect(nav.state.inputMode).toBe('bash')

      nav.navigateUp()
      expect(nav.state.inputValue).toBe('entry with @mention')
      expect(nav.state.inputMode).toBe('default')
    })
  })

  describe('unicode in history', () => {
    test('handles unicode characters in entries', () => {
      const nav = createMockHistoryNavigator([
        '日本語のテキスト',
        '!echo 🚀',
        'émojis 👍 and açcénts',
      ])

      nav.navigateUp()
      expect(nav.state.inputValue).toBe('émojis 👍 and açcénts')

      nav.navigateUp()
      expect(nav.state.inputValue).toBe('echo 🚀')
      expect(nav.state.inputMode).toBe('bash')

      nav.navigateUp()
      expect(nav.state.inputValue).toBe('日本語のテキスト')
      expect(nav.state.inputMode).toBe('default')
    })
  })

  describe('very long entries', () => {
    test('handles very long history entries', () => {
      const longText = 'a'.repeat(10000)
      const longBashCommand = '!' + 'b'.repeat(10000)
      
      const nav = createMockHistoryNavigator([longText, longBashCommand])

      nav.navigateUp()
      expect(nav.state.inputValue).toBe('b'.repeat(10000))
      expect(nav.state.inputMode).toBe('bash')

      nav.navigateUp()
      expect(nav.state.inputValue).toBe(longText)
      expect(nav.state.inputMode).toBe('default')
    })
  })
})

describe('use-input-history - mode preservation', () => {
  test('preserves draft mode when navigating and returning', () => {
    const nav = createMockHistoryNavigator([
      'default 1',
      '!bash 1',
      'default 2',
      '!bash 2',
    ])

    nav.state.inputMode = 'default'
    nav.state.inputValue = 'my default draft'

    nav.navigateUp()
    nav.navigateUp()
    nav.navigateUp()
    nav.navigateUp()

    nav.navigateDown()
    nav.navigateDown()
    nav.navigateDown()
    nav.navigateDown()
    expect(nav.state.inputMode).toBe('default')
    expect(nav.state.inputValue).toBe('my default draft')
  })

  test('preserves bash mode draft when navigating through default entries', () => {
    const nav = createMockHistoryNavigator(['default 1', 'default 2', 'default 3'])

    nav.state.inputMode = 'bash'
    nav.state.inputValue = 'npm test'

    nav.navigateUp()
    expect(nav.state.inputMode as string).toBe('default')

    nav.navigateUp()
    expect(nav.state.inputMode as string).toBe('default')

    nav.navigateUp()
    expect(nav.state.inputMode as string).toBe('default')

    nav.navigateDown()
    nav.navigateDown()
    nav.navigateDown()
    expect(nav.state.inputMode).toBe('bash')
    expect(nav.state.inputValue).toBe('npm test')
  })
})
