import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test'

import { AskUserBridge } from '@codebuff/common/utils/ask-user-bridge'

import { useChatStore } from '../../state/chat-store'

describe('useAskUserBridge', () => {
  const submitAnswers = (
    answers: Array<{
      questionIndex: number
      selectedOption?: string
      selectedOptions?: string[]
      otherText?: string
    }>
  ) => {
    AskUserBridge.submit({ answers })
  }

  const skip = () => {
    AskUserBridge.submit({ skipped: true })
  }

  let submitSpy: ReturnType<typeof spyOn>

  beforeEach(() => {
    // Mock AskUserBridge.submit to track calls
    submitSpy = spyOn(AskUserBridge, 'submit')

    // Reset the chat store to a known state with some input
    useChatStore.setState({
      inputValue: 'user input that should be preserved',
      cursorPosition: 35,
      lastEditDueToNav: false,
      askUserState: null,
    })
  })

  afterEach(() => {
    submitSpy.mockRestore()
  })

  describe('submitAnswers', () => {
    test('calls AskUserBridge.submit with the provided answers', () => {
      const answers = [
        { questionIndex: 0, selectedOption: 'Option A' },
        { questionIndex: 1, selectedOptions: ['Option B', 'Option C'] },
      ]

      submitAnswers(answers)

      expect(submitSpy).toHaveBeenCalledTimes(1)
      expect(submitSpy).toHaveBeenCalledWith({ answers })
    })

    test('does NOT modify the input value in the store', () => {
      const originalInputValue = useChatStore.getState().inputValue
      const originalCursorPosition = useChatStore.getState().cursorPosition

      submitAnswers([{ questionIndex: 0, selectedOption: 'Test' }])

      // Verify input value was NOT changed
      const currentState = useChatStore.getState()
      expect(currentState.inputValue).toBe(originalInputValue)
      expect(currentState.cursorPosition).toBe(originalCursorPosition)
    })

    test('preserves input value with empty answers array', () => {
      const originalInputValue = useChatStore.getState().inputValue

      submitAnswers([])

      expect(useChatStore.getState().inputValue).toBe(originalInputValue)
      expect(submitSpy).toHaveBeenCalledWith({ answers: [] })
    })

    test('preserves input value with multiple question answers', () => {
      const originalInputValue = useChatStore.getState().inputValue

      const answers = [
        { questionIndex: 0, selectedOption: 'First answer' },
        { questionIndex: 1, selectedOptions: ['Multi 1', 'Multi 2'] },
        { questionIndex: 2, otherText: 'Custom text input' },
      ]

      submitAnswers(answers)

      expect(useChatStore.getState().inputValue).toBe(originalInputValue)
    })
  })

  describe('skip', () => {
    test('calls AskUserBridge.submit with skipped: true', () => {
      skip()

      expect(submitSpy).toHaveBeenCalledTimes(1)
      expect(submitSpy).toHaveBeenCalledWith({ skipped: true })
    })

    test('does NOT modify the input value in the store', () => {
      const originalInputValue = useChatStore.getState().inputValue
      const originalCursorPosition = useChatStore.getState().cursorPosition

      skip()

      // Verify input value was NOT changed
      const currentState = useChatStore.getState()
      expect(currentState.inputValue).toBe(originalInputValue)
      expect(currentState.cursorPosition).toBe(originalCursorPosition)
    })
  })

  describe('input preservation regression tests', () => {
    test('input with special characters is preserved after submitAnswers', () => {
      useChatStore.setState({
        inputValue: 'Input with "quotes" and `backticks` and @mentions',
        cursorPosition: 48,
      })

      const originalInputValue = useChatStore.getState().inputValue

      submitAnswers([{ questionIndex: 0, selectedOption: 'Test' }])

      expect(useChatStore.getState().inputValue).toBe(originalInputValue)
    })

    test('input with special characters is preserved after skip', () => {
      useChatStore.setState({
        inputValue: "Don't lose this apostrophe or @file-picker mention",
        cursorPosition: 51,
      })

      const originalInputValue = useChatStore.getState().inputValue

      skip()

      expect(useChatStore.getState().inputValue).toBe(originalInputValue)
    })

    test('multiline input is preserved after submitAnswers', () => {
      useChatStore.setState({
        inputValue: 'Line 1\nLine 2\nLine 3',
        cursorPosition: 20,
      })

      const originalInputValue = useChatStore.getState().inputValue

      submitAnswers([{ questionIndex: 0, selectedOption: 'Test' }])

      expect(useChatStore.getState().inputValue).toBe(originalInputValue)
    })

    test('empty input remains empty after submitAnswers', () => {
      useChatStore.setState({
        inputValue: '',
        cursorPosition: 0,
      })

      submitAnswers([{ questionIndex: 0, selectedOption: 'Test' }])

      expect(useChatStore.getState().inputValue).toBe('')
      expect(useChatStore.getState().cursorPosition).toBe(0)
    })

    test('empty input remains empty after skip', () => {
      useChatStore.setState({
        inputValue: '',
        cursorPosition: 0,
      })

      skip()

      expect(useChatStore.getState().inputValue).toBe('')
      expect(useChatStore.getState().cursorPosition).toBe(0)
    })
  })
})
