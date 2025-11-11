import { useCallback } from 'react'

import type { InputValue } from '../state/chat-store'
import type { KeyEvent } from '@opentui/core'

interface MenuContext {
  active: boolean
  startIndex: number
  query: string
}

interface MenuItem {
  id?: string
  displayName?: string
}

interface UseSuggestionMenuHandlersOptions {
  slashContext: MenuContext
  mentionContext: MenuContext
  slashMatches: MenuItem[]
  agentMatches: MenuItem[]
  slashSelectedIndex: number
  agentSelectedIndex: number
  inputValue: string
  setInputValue: (value: InputValue) => void
  setSlashSelectedIndex: (value: number | ((prev: number) => number)) => void
  setAgentSelectedIndex: (value: number | ((prev: number) => number)) => void
}

const hasModifier = (key: KeyEvent) =>
  Boolean(key.ctrl || key.meta || key.option)

export const useSuggestionMenuHandlers = ({
  slashContext,
  mentionContext,
  slashMatches,
  agentMatches,
  slashSelectedIndex,
  agentSelectedIndex,
  inputValue,
  setInputValue,
  setSlashSelectedIndex,
  setAgentSelectedIndex,
}: UseSuggestionMenuHandlersOptions) => {
  const selectSlashItem = useCallback(
    (index: number) => {
      const selected = slashMatches[index]
      if (!selected || slashContext.startIndex < 0) return false

      const before = inputValue.slice(0, slashContext.startIndex)
      const after = inputValue.slice(
        slashContext.startIndex + 1 + slashContext.query.length,
      )
      const replacement = `/${selected.id} `
      const newValue = before + replacement + after

      setInputValue({
        text: newValue,
        cursorPosition: before.length + replacement.length,
        lastEditDueToNav: false,
      })
      setSlashSelectedIndex(0)
      return true
    },
    [
      slashMatches,
      slashContext,
      inputValue,
      setInputValue,
      setSlashSelectedIndex,
    ],
  )

  const selectAgentItem = useCallback(
    (index: number) => {
      const selected = agentMatches[index]
      if (!selected || mentionContext.startIndex < 0) return false

      const before = inputValue.slice(0, mentionContext.startIndex)
      const after = inputValue.slice(
        mentionContext.startIndex + 1 + mentionContext.query.length,
      )
      const replacement = `@${selected.displayName} `
      const newValue = before + replacement + after

      setInputValue({
        text: newValue,
        cursorPosition: before.length + replacement.length,
        lastEditDueToNav: false,
      })
      setAgentSelectedIndex(0)
      return true
    },
    [
      agentMatches,
      mentionContext,
      inputValue,
      setInputValue,
      setAgentSelectedIndex,
    ],
  )

  const handleSlashMenuKey = useCallback(
    (key: KeyEvent): boolean => {
      if (!slashContext.active || slashMatches.length === 0) return false

      const selectCurrent = () =>
        selectSlashItem(slashSelectedIndex) || selectSlashItem(0)

      if (key.name === 'down' && !hasModifier(key)) {
        if (slashSelectedIndex === slashMatches.length - 1) return true
        setSlashSelectedIndex((prev) => prev + 1)
        return true
      }

      if (key.name === 'up' && !hasModifier(key)) {
        if (slashSelectedIndex === 0) return true
        setSlashSelectedIndex((prev) => prev - 1)
        return true
      }

      if (key.name === 'tab' && key.shift && !hasModifier(key)) {
        setSlashSelectedIndex(
          (prev) => (slashMatches.length + prev - 1) % slashMatches.length,
        )
        return true
      }

      if (key.name === 'tab' && !key.shift && !hasModifier(key)) {
        if (slashMatches.length > 1) {
          setSlashSelectedIndex((prev) => (prev + 1) % slashMatches.length)
        } else {
          selectCurrent()
        }
        return true
      }

      if (key.name === 'return' && !key.shift && !hasModifier(key)) {
        selectCurrent()
        return true
      }

      return false
    },
    [
      slashContext,
      slashMatches,
      slashSelectedIndex,
      selectSlashItem,
      setSlashSelectedIndex,
    ],
  )

  const handleAgentMenuKey = useCallback(
    (key: KeyEvent): boolean => {
      if (!mentionContext.active || agentMatches.length === 0) return false

      const selectCurrent = () =>
        selectAgentItem(agentSelectedIndex) || selectAgentItem(0)

      if (key.name === 'down' && !hasModifier(key)) {
        if (agentSelectedIndex === agentMatches.length - 1) return false
        setAgentSelectedIndex((prev) => prev + 1)
        return true
      }

      if (key.name === 'up' && !hasModifier(key)) {
        if (agentSelectedIndex === 0) return false
        setAgentSelectedIndex((prev) => prev - 1)
        return true
      }

      if (key.name === 'tab' && key.shift && !hasModifier(key)) {
        setAgentSelectedIndex(
          (prev) => (agentMatches.length + prev - 1) % agentMatches.length,
        )
        return true
      }

      if (key.name === 'tab' && !key.shift && !hasModifier(key)) {
        if (agentMatches.length > 1) {
          setAgentSelectedIndex((prev) => (prev + 1) % agentMatches.length)
        } else {
          selectCurrent()
        }
        return true
      }

      if (key.name === 'return' && !key.shift && !hasModifier(key)) {
        selectCurrent()
        return true
      }

      return false
    },
    [
      mentionContext,
      agentMatches,
      agentSelectedIndex,
      selectAgentItem,
      setAgentSelectedIndex,
    ],
  )

  const handleSuggestionMenuKey = useCallback(
    (key: KeyEvent): boolean => {
      if (handleSlashMenuKey(key)) return true
      if (handleAgentMenuKey(key)) return true
      return false
    },
    [handleSlashMenuKey, handleAgentMenuKey],
  )

  return { handleSuggestionMenuKey }
}
