export type UserInputRecord = Record<string, string[]>
export type SessionRecord = Record<string, true | undefined>

export type CheckLiveUserInputFn = (params: {
  userId: string | undefined
  userInputId: string
  clientSessionId: string
  liveUserInputRecord: UserInputRecord
  sessionConnections: SessionRecord
}) => boolean
