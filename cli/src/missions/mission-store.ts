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
const MISSION_FILE = 'mission.json'

export function getMissionPath(projectRoot: string): string {
  let branch = 'default'
  try {
    const execSync = require('child_process').execSync
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectRoot, stdio: 'pipe' }).toString().trim()
  } catch (e) {}
  
  const safeBranch = branch.replace(/[^a-zA-Z0-9_-]/g, '_')
  return path.join(projectRoot, MISSION_DIRECTORY, `mission-${safeBranch}.json`)
}

function writeMission(projectRoot: string, mission: MissionState): void {
  const missionPath = getMissionPath(projectRoot)
  fs.mkdirSync(path.dirname(missionPath), { recursive: true })
  const temporaryPath = `${missionPath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(mission, null, 2)}\n`, 'utf8')
  fs.renameSync(temporaryPath, missionPath)
}

export function loadMission(projectRoot: string): MissionState | null {
  const missionPath = getMissionPath(projectRoot)
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
): MissionState {
  const trimmedObjective = objective.trim()
  if (!trimmedObjective) throw new Error('A missão precisa de um objetivo.')
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
  writeMission(projectRoot, mission)
  return mission
}

export function completeMission(
  projectRoot: string,
  evidence: string[],
): MissionState {
  const mission = loadMission(projectRoot)
  if (!mission) throw new Error('Nenhuma missão encontrada.')
  const completed: MissionState = {
    ...mission,
    status: 'completed',
    evidence: evidence.map((item) => item.trim()).filter(Boolean),
    updatedAt: new Date().toISOString(),
  }
  writeMission(projectRoot, completed)
  return completed
}

export function cancelMission(projectRoot: string): MissionState {
  const mission = loadMission(projectRoot)
  if (!mission) throw new Error('Nenhuma missão encontrada.')
  const cancelled: MissionState = {
    ...mission,
    status: 'cancelled',
    updatedAt: new Date().toISOString(),
  }
  writeMission(projectRoot, cancelled)
  return cancelled
}

export function buildMissionPrompt(mission: MissionState): string {
  return `MISSÃO ATIVA: ${mission.objective}

Execute a missão inteira de forma autônoma. Pesquise de forma estreita, edite, valide e corrija até a evidência confirmar o resultado. Enquanto existir trabalho seguro e acionável, não encerre nem devolva apenas diagnóstico ou próximos passos. Use write_todos como checklist vivo e agrupe alterações antes de executar testes caros.

O estado persistente está em .freebuff/mission.json. **PROTOCOLO DE DOUBLE-CHECK OBRIGATÓRIO**: Antes de atualizar o status para "completed", você DEVE realizar uma auto-revisão crítica. Questione-se: "Eu realmente concluí tudo? O código foi testado? As evidências são reais ou são suposições?". Se houver qualquer falha ou falta de verificação real, CONTINUE TRABALHANDO. Nunca declare conclusão baseado em suposições.
Somente após essa verificação, atualize status para "completed", updatedAt para o horário ISO atual e evidence para uma lista das verificações realmente executadas. Se houver bloqueio externo real, use status "blocked" e registre a evidência do bloqueio.`
}

export function buildMissionContinuation(mission: MissionState): string {
  return `\n\n[Missão persistente ${mission.id}] Continue até concluir: ${mission.objective}. 
Não encerre enquanto houver trabalho acionável. LEMBRE-SE DO PROTOCOLO DE DOUBLE-CHECK: Antes de se dar por satisfeito e marcar "completed" em .freebuff/mission.json, você deve PROVAR que testou e que a solução funciona. Se você apenas acha que funciona, você não terminou. Atualize .freebuff/mission.json com estado e evidência REAIS apenas quando tiver certeza absoluta.`
}

export function formatMissionStatus(mission: MissionState | null): string {
  if (!mission) return 'Nenhuma missão persistente.'
  const evidence = mission.evidence.length
    ? `\nEvidências:\n${mission.evidence.map((item) => `- ${item}`).join('\n')}`
    : ''
  return `Missão ${mission.status}: ${mission.objective}${evidence}`
}
