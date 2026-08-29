import fs from 'fs'
import path from 'path'

export type MissionStatus = 'active' | 'completed' | 'cancelled' | 'blocked'

export type MissionState = {
  version: 1
  id: string
  objective: string
  status: MissionStatus
  createdAt: string
  updatedAt: string
  evidence: string[]
}

const MISSION_DIRECTORY = '.freebuff'

export function getMissionPath(projectRoot: string, scopeId?: string): string {
  // Isolate by scope (chat/conversation) instead of branch
  const id = scopeId ? scopeId.replace(/[^a-zA-Z0-9_-]/g, '_') : 'default'
  return path.join(projectRoot, MISSION_DIRECTORY, `mission-${id}.json`)
}

function writeMission(projectRoot: string, mission: MissionState, scopeId?: string): void {
  const missionPath = getMissionPath(projectRoot, scopeId)
  fs.mkdirSync(path.dirname(missionPath), { recursive: true })
  const temporaryPath = `${missionPath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(mission, null, 2)}\n`, 'utf8')
  fs.renameSync(temporaryPath, missionPath)
}

export function loadMission(projectRoot: string, scopeId?: string): MissionState | null {
  const missionPath = getMissionPath(projectRoot, scopeId)
  if (!fs.existsSync(missionPath)) return null
  try {
    const value = JSON.parse(fs.readFileSync(missionPath, 'utf8')) as MissionState
    if (
      value.version !== 1 ||
      typeof value.id !== 'string' ||
      typeof value.objective !== 'string' ||
      !Array.isArray(value.evidence)
    ) {
      return null
    }
    return value
  } catch {
    return null
  }
}

export function createMission(
  projectRoot: string,
  objective: string,
  scopeId?: string,
): MissionState {
  const trimmedObjective = objective.trim()
  if (!trimmedObjective) throw new Error('Mission requires an objective.')
  const now = new Date().toISOString()
  const mission: MissionState = {
    version: 1,
    id: crypto.randomUUID(),
    objective: trimmedObjective,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    evidence: [],
  }
  writeMission(projectRoot, mission, scopeId)
  return mission
}

export function completeMission(
  projectRoot: string,
  evidence: string[],
  scopeId?: string,
): MissionState {
  const mission = loadMission(projectRoot, scopeId)
  if (!mission) throw new Error('No mission found.')
  const completed: MissionState = {
    ...mission,
    status: 'completed',
    evidence: evidence.map((item) => item.trim()).filter(Boolean),
    updatedAt: new Date().toISOString(),
  }
  writeMission(projectRoot, completed, scopeId)
  return completed
}

export function cancelMission(projectRoot: string, scopeId?: string): MissionState {
  const mission = loadMission(projectRoot, scopeId)
  if (!mission) throw new Error('No mission found.')
  const cancelled: MissionState = {
    ...mission,
    status: 'cancelled',
    updatedAt: new Date().toISOString(),
  }
  writeMission(projectRoot, cancelled, scopeId)
  return cancelled
}

export function refreshMissionCompletion(projectRoot: string, scopeId?: string): MissionState | null {
  const mission = loadMission(projectRoot, scopeId)
  if (!mission) return null
  
  if (mission.status === 'completed') {
     // Mission is marked as completed. However, if task_plan.md has pending tasks...
     const planPath = path.join(projectRoot, 'task_plan.md')
     if (fs.existsSync(planPath)) {
        const plan = fs.readFileSync(planPath, 'utf8')
        if (plan.includes('- [ ]') || plan.includes('- [/]')) {
           mission.status = 'active'
           mission.evidence = ['Forced back to active: there are pending tasks in the plan']
           writeMission(projectRoot, mission, scopeId)
        }
     }
  }
  return mission
}

export function buildMissionPrompt(projectRoot: string, mission: MissionState, scopeId?: string): string {
  const relPath = path.relative(projectRoot, getMissionPath(projectRoot, scopeId)).replace(/\\/g, '/')
  return `ACTIVE MISSION: ${mission.objective}

Execute the entire mission autonomously. Strictly follow the task_plan.md file. Do not edit the mission via str_replace, as this is ignored. Instead, use the write_todos tool to update progress in the task plan.

The persistent state of this conversation is in ${relPath}. **PROTOCOLO DE DOUBLE-CHECK OBRIGATÓRIO**: Antes de se dar por satisfeito, você DEVE garantir que não há itens \`- [ ]\` no arquivo task_plan.md. Se houver falhas, CONTINUE TRABALHANDO.
`
}

export function buildMissionContinuation(projectRoot: string, mission: MissionState, scopeId?: string): string {
  const relPath = path.relative(projectRoot, getMissionPath(projectRoot, scopeId)).replace(/\\/g, '/')
  return `\n\n[Persistent mission ${mission.id}] Continue until complete: ${mission.objective}. Do not stop while there are unchecked boxes in task_plan.md.`
}

export function formatMissionStatus(mission: MissionState | null): string {
  if (!mission) return 'No persistent mission.'
  const evidence = mission.evidence.length
    ? `\nEvidence:\n${mission.evidence.map((item) => `- ${item}`).join('\n')}`
    : ''
  return `Mission ${mission.status}: ${mission.objective}${evidence}`
}
