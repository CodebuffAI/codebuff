import type { CodebuffConfig } from './constants'

export function getDefaultConfig(): CodebuffConfig {
  return {
    description: '',
    startupProcesses: [],
    fileChangeHooks: [],
    maxAgentSteps: 12,
    baseAgent: undefined,
    spawnableAgents: undefined,
  }
}
