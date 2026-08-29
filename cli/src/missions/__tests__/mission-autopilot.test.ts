import { describe, expect, it } from 'bun:test'

import { getMissionAutopilotAction, shouldAutoStartMissionSession } from '../mission-autopilot'

describe('mission autopilot', () => {
  it('continues an active mission whenever the chat becomes idle', () => {
    expect(getMissionAutopilotAction({ active: true, idle: true, sessionOver: false })).toBe('continue')
  })

  it('renews an ended session instead of waiting for Enter', () => {
    expect(getMissionAutopilotAction({ active: true, idle: true, sessionOver: true })).toBe('renew')
  })

  it('does nothing while work is running or after completion', () => {
    expect(getMissionAutopilotAction({ active: true, idle: false, sessionOver: false })).toBe('none')
    expect(getMissionAutopilotAction({ active: false, idle: true, sessionOver: true })).toBe('none')
  })

  it('starts DeepSeek automatically from the landing screen for active missions', () => {
    expect(shouldAutoStartMissionSession(true, 'none')).toBe(true)
    expect(shouldAutoStartMissionSession(false, 'none')).toBe(false)
    expect(shouldAutoStartMissionSession(true, 'active')).toBe(false)
  })
})
