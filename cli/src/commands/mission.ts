import { getMissionScopeId, getProjectRoot } from '../project-files'
import {
  buildMissionPrompt,
  cancelMission,
  completeMission,
  createMission,
  formatMissionStatus,
  loadMission,
} from '../missions/mission-store'

function root(): string {
  return getProjectRoot() || process.cwd()
}

function scope(): string | undefined {
  try {
    return getMissionScopeId()
  } catch {
    return undefined
  }
}

export type MissionCommandResult =
  | { kind: 'message'; message: string }
  | { kind: 'start'; prompt: string }

export function runMissionCommand(args: string): MissionCommandResult {
  const trimmed = args.trim()
  let [verb, ...rest] = trimmed ? trimmed.split(/\s+/) : ['status']
  
  if (verb.endsWith(',')) {
    verb = verb.slice(0, -1)
  }
  
  const value = rest.join(' ').trim()

  if (verb === 'status') {
    return { kind: 'message', message: formatMissionStatus(loadMission(root(), scope())) }
  }
  if (verb === 'start') {
    if (!value) {
      return { kind: 'message', message: 'Usage: /mission start <objective>' }
    }
    const mission = createMission(root(), value, scope())
    return { kind: 'start', prompt: buildMissionPrompt(root(), mission, scope()) }
  }
  if (verb === 'complete') {
    const evidence = value ? value.split('|').map((item) => item.trim()) : []
    try {
      const mission = completeMission(root(), evidence, scope())
      return { kind: 'message', message: formatMissionStatus(mission) }
    } catch (error) {
      return {
        kind: 'message',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }
  if (verb === 'cancel') {
    try {
      const mission = cancelMission(root(), scope())
      return { kind: 'message', message: formatMissionStatus(mission) }
    } catch (error) {
      return {
        kind: 'message',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }
  return {
    kind: 'message',
    message: 'Uso: /mission [status|start <objetivo>|complete [evidência]|cancel]',
  }
}
