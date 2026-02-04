import { useCallback, useEffect, useRef, useState } from 'react'

import { getCurrentChatId } from '../project-files'
import { flushAnalytics } from '../utils/analytics'
import { withTimeout } from '../utils/terminal-color-detection'

import type { InputValue } from '../types/store'

// Timeout for analytics flush during exit - don't block exit for too long
const EXIT_FLUSH_TIMEOUT_MS = 1000

interface UseExitHandlerOptions {
  inputValue: string
  setInputValue: (value: InputValue) => void
}

let exitHandlerRegistered = false

function setupExitMessageHandler() {
  if (exitHandlerRegistered) return
  exitHandlerRegistered = true

  process.on('exit', () => {
    try {
      const chatId = getCurrentChatId()
      if (chatId) {
        // This runs synchronously during the exit phase
        // OpenTUI has already cleaned up by this point
        process.stdout.write(
          `\nTo continue this session later, run:\ncodebuff --continue ${chatId}\n`,
        )
      }
    } catch {
      // Silent fail - don't block exit
    }
  })
}

export const useExitHandler = ({
  inputValue,
  setInputValue,
}: UseExitHandlerOptions) => {
  const [nextCtrlCWillExit, setNextCtrlCWillExit] = useState(false)
  const exitWarningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  useEffect(() => {
    setupExitMessageHandler()
  }, [])

  const handleCtrlC = useCallback(() => {
    if (inputValue) {
      setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
      return true
    }

    if (!nextCtrlCWillExit) {
      setNextCtrlCWillExit(true)
      setTimeout(() => {
        setNextCtrlCWillExit(false)
      }, 2000)
      return true
    }

    if (exitWarningTimeoutRef.current) {
      clearTimeout(exitWarningTimeoutRef.current)
      exitWarningTimeoutRef.current = null
    }

    withTimeout(flushAnalytics(), EXIT_FLUSH_TIMEOUT_MS, undefined).then(() => {
      process.exit(0)
    })
    return true
  }, [inputValue, setInputValue, nextCtrlCWillExit])

  useEffect(() => {
    const handleSigint = () => {
      if (exitWarningTimeoutRef.current) {
        clearTimeout(exitWarningTimeoutRef.current)
        exitWarningTimeoutRef.current = null
      }

      withTimeout(flushAnalytics(), EXIT_FLUSH_TIMEOUT_MS, undefined).finally(
        () => {
          process.exit(0)
        },
      )
    }

    process.on('SIGINT', handleSigint)
    return () => {
      process.off('SIGINT', handleSigint)
    }
  }, [])

  return { handleCtrlC, nextCtrlCWillExit }
}
