export type MissionAutopilotParams = {
  active: boolean
  idle: boolean
  sessionOver: boolean
}

export function getMissionAutopilotAction(params: MissionAutopilotParams): 'continue' | 'none' {
  if (params.active && params.idle) {
    return 'continue'
  }
  return 'none'
}
