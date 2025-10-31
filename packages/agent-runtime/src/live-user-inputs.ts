import type {
  CheckLiveUserInputFn,
  SessionRecord,
  UserInputRecord,
} from '@codebuff/common/types/contracts/live-user-input'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsOf } from '@codebuff/common/types/function-params'

// TODO: Remove this once we switch to sdk-only

let liveUserInputCheckEnabled = true
export const disableLiveUserInputCheck = () => {
  liveUserInputCheckEnabled = false
}

let sessionConnectionCheckEnabled = true
export const disableSessionConnectionCheck = () => {
  sessionConnectionCheckEnabled = false
}

export function startUserInput(params: {
  userId: string
  userInputId: string
  liveUserInputRecord: UserInputRecord
}): void {
  const { userId, userInputId, liveUserInputRecord } = params
  if (!liveUserInputRecord[userId]) {
    liveUserInputRecord[userId] = []
  }
  liveUserInputRecord[userId].push(userInputId)
}

export function cancelUserInput(params: {
  userId: string
  userInputId: string
  liveUserInputRecord: UserInputRecord
  logger: Logger
}): void {
  const { userId, userInputId, liveUserInputRecord, logger } = params
  if (
    liveUserInputRecord[userId] &&
    liveUserInputRecord[userId].includes(userInputId)
  ) {
    liveUserInputRecord[userId] = liveUserInputRecord[userId].filter(
      (id) => id !== userInputId,
    )
    if (liveUserInputRecord[userId].length === 0) {
      delete liveUserInputRecord[userId]
    }
  } else {
    logger.debug(
      {
        userId,
        userInputId,
        liveUserInputId: liveUserInputRecord[userId] ?? 'undefined',
      },
      'Tried to cancel user input with incorrect userId or userInputId',
    )
  }
}

export function checkLiveUserInput(
  params: ParamsOf<CheckLiveUserInputFn> & { logger: Logger },
): ReturnType<CheckLiveUserInputFn> {
  const {
    userId,
    userInputId,
    clientSessionId,
    liveUserInputRecord,
    sessionConnections,
  } = params

  if (!liveUserInputCheckEnabled) {
    return true
  }
  if (!userId) {
    return false
  }

  // Check if WebSocket is still connected for this session
  if (sessionConnectionCheckEnabled && !sessionConnections[clientSessionId]) {
    return false
  }

  if (!liveUserInputRecord[userId]) {
    return false
  }
  return liveUserInputRecord[userId].some((stored) =>
    userInputId.startsWith(stored),
  )
}

export function setSessionConnected(params: {
  sessionId: string
  connected: boolean
  sessionConnections: SessionRecord
}): void {
  const { sessionId, connected, sessionConnections } = params

  if (connected) {
    sessionConnections[sessionId] = true
  } else {
    delete sessionConnections[sessionId]
  }
}

export function getLiveUserInputIds(params: {
  userId: string | undefined
  liveUserInputRecord: UserInputRecord
}): string[] | undefined {
  const { userId, liveUserInputRecord } = params

  if (!userId) {
    return undefined
  }
  return liveUserInputRecord[userId]
}

// For testing purposes - reset all state
export function resetLiveUserInputsState(params: {
  liveUserInputRecord: UserInputRecord
  sessionConnections: SessionRecord
}): void {
  const { liveUserInputRecord, sessionConnections } = params
  Object.keys(liveUserInputRecord).forEach(
    (key) => delete liveUserInputRecord[key],
  )
  Object.keys(sessionConnections).forEach(
    (key) => delete sessionConnections[key],
  )
  liveUserInputCheckEnabled = true
  sessionConnectionCheckEnabled = true
}
