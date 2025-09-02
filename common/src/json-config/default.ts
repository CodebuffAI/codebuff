import { MAX_AGENT_STEPS_DEFAULT } from '../constants/agents'
import { type CodebuffConfig } from './constants'

export function getDefaultConfig(): CodebuffConfig {
  return {
    description: '',
    startupProcesses: [],
    fileChangeHooks: [],
    maxAgentSteps: MAX_AGENT_STEPS_DEFAULT,
    baseAgent: undefined,
    spawnableAgents: undefined,
  }
}

