import { logger } from './util/logger'

let liveUserInputCheckEnabled = true
export const disableLiveUserInputCheck = () => {
  liveUserInputCheckEnabled = false
}

/** Map from userId to main userInputIds */
const live: Record<string, string[]> = {}

export function startUserInput(userId: string, userInputId: string): void {
  if (!live[userId]) {
    live[userId] = []
  }
  live[userId].push(userInputId)
}

export function endUserInput(userId: string, userInputId: string): void {
  if (live[userId] && live[userId].includes(userInputId)) {
    live[userId] = live[userId].filter((id) => id !== userInputId)
    if (live[userId].length === 0) {
      delete live[userId]
    }
  } else {
    logger.debug(
      { userId, userInputId, liveUserInputId: live[userId] ?? 'undefined' },
      'Tried to end user input with incorrect userId or userInputId'
    )
  }
}

export function checkLiveUserInput(
  userId: string | undefined,
  userInputId: string
): boolean {
  if (!liveUserInputCheckEnabled) {
    return true
  }
  if (!userId) {
    return false
  }
  if (!live[userId]) {
    // Allow async agents to continue even if main input ended
    return userInputId.includes('-async-')
  }
  return live[userId].some((stored) => userInputId.startsWith(stored)) || 
         userInputId.includes('-async-')
}

export function getLiveUserInputIds(
  userId: string | undefined
): string[] | undefined {
  if (!userId) {
    return undefined
  }
  return live[userId]
}
