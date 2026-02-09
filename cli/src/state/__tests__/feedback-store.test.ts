import { describe, it, expect, beforeEach } from 'bun:test'
import { enableMapSet } from 'immer'

import { useFeedbackStore } from '../feedback-store'

enableMapSet()

describe('FeedbackStore', () => {
  beforeEach(() => {
    useFeedbackStore.getState().reset()
  })

  describe('openFeedbackForMessage', () => {
    it('should open feedback mode for a specific message', () => {
      const store = useFeedbackStore.getState()

      store.openFeedbackForMessage('message-123')

      const state = useFeedbackStore.getState()
      expect(state.feedbackMode).toBe(true)
      expect(state.feedbackMessageId).toBe('message-123')
      expect(state.feedbackText).toBe('')
      expect(state.feedbackCategory).toBe('other')
    })

    it('should open general feedback mode when messageId is null', () => {
      const store = useFeedbackStore.getState()

      store.openFeedbackForMessage(null)

      const state = useFeedbackStore.getState()
      expect(state.feedbackMode).toBe(true)
      expect(state.feedbackMessageId).toBeNull()
    })

    it('should generate a clientFeedbackId UUID on open', () => {
      const store = useFeedbackStore.getState()

      store.openFeedbackForMessage('message-123')

      const state = useFeedbackStore.getState()
      expect(state.clientFeedbackId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
    })
  })

  describe('closeFeedback', () => {
    it('should close feedback mode and clear clientFeedbackId', () => {
      const store = useFeedbackStore.getState()
      store.openFeedbackForMessage('message-123')
      expect(useFeedbackStore.getState().clientFeedbackId).not.toBeNull()

      store.closeFeedback()

      const state = useFeedbackStore.getState()
      expect(state.feedbackMode).toBe(false)
      expect(state.feedbackMessageId).toBeNull()
      expect(state.clientFeedbackId).toBeNull()
    })

    it('should reset feedbackText, feedbackCursor, and feedbackCategory', () => {
      const store = useFeedbackStore.getState()
      store.openFeedbackForMessage('message-123')
      store.setFeedbackText('some feedback text')
      store.setFeedbackCursor(10)
      store.setFeedbackCategory('bad_result')

      store.closeFeedback()

      const state = useFeedbackStore.getState()
      expect(state.feedbackText).toBe('')
      expect(state.feedbackCursor).toBe(0)
      expect(state.feedbackCategory).toBe('other')
    })
  })

  describe('feedback text management', () => {
    it('should update feedback text and cursor', () => {
      const store = useFeedbackStore.getState()

      store.setFeedbackText('This is my feedback')
      store.setFeedbackCursor(10)

      const state = useFeedbackStore.getState()
      expect(state.feedbackText).toBe('This is my feedback')
      expect(state.feedbackCursor).toBe(10)
    })

    it('should update feedback category', () => {
      const store = useFeedbackStore.getState()

      store.setFeedbackCategory('good_result')

      expect(useFeedbackStore.getState().feedbackCategory).toBe('good_result')
    })

    it('should preserve category when only clearing text and cursor', () => {
      const store = useFeedbackStore.getState()
      store.openFeedbackForMessage('message-123')
      store.setFeedbackCategory('bad_result')
      store.setFeedbackText('some feedback text')
      store.setFeedbackCursor(10)

      store.setFeedbackText('')
      store.setFeedbackCursor(0)

      const state = useFeedbackStore.getState()
      expect(state.feedbackText).toBe('')
      expect(state.feedbackCursor).toBe(0)
      expect(state.feedbackCategory).toBe('bad_result')
    })
  })

  describe('input save and restore', () => {
    it('should save and restore input state', () => {
      const store = useFeedbackStore.getState()

      store.saveCurrentInput('My current input', 15)

      const restored = store.restoreSavedInput()
      expect(restored.value).toBe('My current input')
      expect(restored.cursor).toBe(15)
    })
  })

  describe('feedback submission tracking', () => {
    it('should mark a message as having feedback submitted', () => {
      const store = useFeedbackStore.getState()

      store.markMessageFeedbackSubmitted('message-123', 'good_result')

      const state = useFeedbackStore.getState()
      expect(state.messagesWithFeedback.has('message-123')).toBe(true)
      expect(state.messageFeedbackCategories.get('message-123')).toBe(
        'good_result',
      )
    })

    it('should track multiple message feedbacks', () => {
      const store = useFeedbackStore.getState()

      store.markMessageFeedbackSubmitted('message-1', 'good_result')
      store.markMessageFeedbackSubmitted('message-2', 'bad_result')
      store.markMessageFeedbackSubmitted('message-3', 'app_bug')

      const state = useFeedbackStore.getState()
      expect(state.messagesWithFeedback.size).toBe(3)
      expect(state.messageFeedbackCategories.size).toBe(3)
      expect(state.messageFeedbackCategories.get('message-2')).toBe(
        'bad_result',
      )
    })
  })

  describe('resetFeedbackForm', () => {
    it('should reset form fields but keep metadata', () => {
      const store = useFeedbackStore.getState()

      store.setFeedbackText('Some text')
      store.setFeedbackCursor(5)
      store.setFeedbackCategory('bad_result')
      store.openFeedbackForMessage('message-123')
      store.markMessageFeedbackSubmitted('message-456', 'good_result')

      store.resetFeedbackForm()

      const state = useFeedbackStore.getState()
      expect(state.feedbackText).toBe('')
      expect(state.feedbackCursor).toBe(0)
      expect(state.feedbackCategory).toBe('other')
      expect(state.feedbackMessageId).toBeNull()
      expect(state.clientFeedbackId).toBeNull()
      expect(state.messagesWithFeedback.has('message-456')).toBe(true)
    })
  })

  describe('isSubmitting', () => {
    it('should default to false', () => {
      const state = useFeedbackStore.getState()
      expect(state.isSubmitting).toBe(false)
    })

    it('should update via setIsSubmitting', () => {
      const store = useFeedbackStore.getState()

      store.setIsSubmitting(true)
      expect(useFeedbackStore.getState().isSubmitting).toBe(true)

      store.setIsSubmitting(false)
      expect(useFeedbackStore.getState().isSubmitting).toBe(false)
    })
  })

  describe('reset', () => {
    it('should reset entire store to initial state', () => {
      const store = useFeedbackStore.getState()

      store.openFeedbackForMessage('message-123')
      store.setFeedbackText('Some text')
      store.setIsSubmitting(true)
      store.markMessageFeedbackSubmitted('message-456', 'good_result')
      store.saveCurrentInput('Saved input', 10)

      store.reset()

      const state = useFeedbackStore.getState()
      expect(state.feedbackMode).toBe(false)
      expect(state.feedbackMessageId).toBeNull()
      expect(state.feedbackText).toBe('')
      expect(state.feedbackCursor).toBe(0)
      expect(state.feedbackCategory).toBe('other')
      expect(state.isSubmitting).toBe(false)
      expect(state.clientFeedbackId).toBeNull()
      expect(state.savedInputValue).toBe('')
      expect(state.savedCursorPosition).toBe(0)
      expect(state.messagesWithFeedback.size).toBe(0)
      expect(state.messageFeedbackCategories.size).toBe(0)
    })
  })

  describe('selectors', () => {
    it('should correctly select feedback open state for specific message', () => {
      const { selectIsFeedbackOpenForMessage } = require('../feedback-store')
      const store = useFeedbackStore.getState()

      store.openFeedbackForMessage('message-123')

      const state = useFeedbackStore.getState()
      expect(selectIsFeedbackOpenForMessage('message-123')(state)).toBe(true)
      expect(selectIsFeedbackOpenForMessage('message-456')(state)).toBe(false)
    })

    it('should correctly select if message has submitted feedback', () => {
      const { selectHasSubmittedFeedback } = require('../feedback-store')
      const store = useFeedbackStore.getState()

      store.markMessageFeedbackSubmitted('message-123', 'good_result')

      const state = useFeedbackStore.getState()
      expect(selectHasSubmittedFeedback('message-123')(state)).toBe(true)
      expect(selectHasSubmittedFeedback('message-456')(state)).toBe(false)
    })

    it('should correctly select message feedback category', () => {
      const { selectMessageFeedbackCategory } = require('../feedback-store')
      const store = useFeedbackStore.getState()

      store.markMessageFeedbackSubmitted('message-123', 'bad_result')

      const state = useFeedbackStore.getState()
      expect(selectMessageFeedbackCategory('message-123')(state)).toBe(
        'bad_result',
      )
      expect(
        selectMessageFeedbackCategory('message-456')(state),
      ).toBeUndefined()
    })
  })
})
