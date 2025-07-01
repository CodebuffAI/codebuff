import { logger } from './util/logger'

let liveUserInputCheckEnabled = true
export const disableLiveUserInputCheck = () => {
  liveUserInputCheckEnabled = false
}

/** Map from user_id to user_input_id */
const live: Record<string, string> = {}

export function startUserInput(userId: string, userInputId: string): void {
  live[userId] = userInputId
}

export function endUserInput(userId: string, userInputId: string): void {
  if (live[userId] === userInputId) {
    delete live[userId]
  } else {
    logger.error(
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
  return userInputId.startsWith(live[userId])
}

export function getLiveUserInputId(
  userId: string | undefined
): string | undefined {
  if (!userId) {
    return undefined
  }
  return live[userId]
}
