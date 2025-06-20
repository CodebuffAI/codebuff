import { CodebuffConfig } from './constants'

export function getDefaultConfig(): CodebuffConfig {
  return {
    description: '',
    startupProcesses: [],
    fileChangeHooks: [],
    maxAgentSteps: 12,
  }
}
