import {
  OPEN_DELAY_MS,
  CLOSE_DELAY_MS,
  REOPEN_SUPPRESS_MS,
} from '../../components/agent-mode-toggle'

export const createHoverToggleControllerForTest = () => {
  let isOpen = false
  let reopenBlockedUntil = 0
  let openTimeout: any = null
  let closeTimeout: any = null

  const clearOpenTimer = () => {
    clearTimeout(openTimeout)
    openTimeout = null
  }

  const clearCloseTimer = () => {
    clearTimeout(closeTimeout)
    closeTimeout = null
  }

  const clearAllTimers = () => {
    clearOpenTimer()
    clearCloseTimer()
  }

  const openNow = () => {
    clearAllTimers()
    isOpen = true
  }

  const closeNow = (suppressReopen = false) => {
    clearAllTimers()
    isOpen = false
    if (suppressReopen) {
      reopenBlockedUntil = Date.now() + REOPEN_SUPPRESS_MS
    }
  }

  const scheduleOpen = () => {
    if (isOpen) return
    if (Date.now() < reopenBlockedUntil) return
    clearOpenTimer()
    openTimeout = setTimeout(() => {
      openNow()
    }, OPEN_DELAY_MS)
  }

  const scheduleClose = () => {
    if (!isOpen) return
    clearCloseTimer()
    closeTimeout = setTimeout(() => {
      isOpen = false
      closeTimeout = null
    }, CLOSE_DELAY_MS)
  }

  return {
    get isOpen() {
      return isOpen
    },
    openNow,
    closeNow,
    scheduleOpen,
    scheduleClose,
    clearOpenTimer,
    clearCloseTimer,
    clearAllTimers,
  }
}
