import type { AgentStep } from 'scaffolding'

export type Runner = {
  run: (prompt: string) => Promise<{ steps: AgentStep[] }>
}
