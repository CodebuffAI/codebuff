import { getProjectRoot } from '../project-files'
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
    return { kind: 'message', message: formatMissionStatus(loadMission(root())) }
  }
  if (verb === 'start') {
    if (!value) {
      return { kind: 'message', message: 'Uso: /mission start <objetivo>' }
    }
    const mission = createMission(root(), value)
    return { kind: 'start', prompt: buildMissionPrompt(root(), mission) }
  }
  if (verb === 'complete') {
    const evidence = value ? value.split('|').map((item) => item.trim()) : []
    try {
      const mission = completeMission(root(), evidence)
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
      const mission = cancelMission(root())
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
