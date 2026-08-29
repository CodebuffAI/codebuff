import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  buildMissionPrompt,
  completeMission,
  createMission,
  loadMission,
} from '../mission-store'

describe('mission store', () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'freebuff-mission-'))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('persists a resumable mission atomically', () => {
    const mission = createMission(root, 'Corrigir streaming e provar com testes')

    expect(loadMission(root)).toEqual(mission)
    expect(mission.status).toBe('active')
    expect(mission.objective).toContain('streaming')
  })

  it('marks a mission complete with evidence', () => {
    createMission(root, 'Finalizar suporte MCP')
    const completed = completeMission(root, ['60 testes passaram', 'CLI abriu'])

    expect(completed.status).toBe('completed')
    expect(completed.evidence).toHaveLength(2)
    expect(loadMission(root)?.status).toBe('completed')
  })

  it('builds an action-first prompt that prevents premature completion', () => {
    const mission = createMission(root, 'Entregar recurso completo')
    const prompt = buildMissionPrompt(mission)

    expect(prompt).toContain('MISSÃO ATIVA')
    expect(prompt).toContain('Entregar recurso completo')
    expect(prompt).toContain('não encerre')
    expect(prompt).toContain('.freebuff/mission.json')
    expect(prompt).toContain('evidência')
  })
})
