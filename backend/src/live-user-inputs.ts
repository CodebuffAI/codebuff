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
  delete live[userId]
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
