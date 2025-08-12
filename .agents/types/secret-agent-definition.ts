import { AgentDefinition } from './agent-definition'
import type * as Tools from './tools'
export type { Tools }

export type AllToolNames =
  | Tools.ToolName
  | 'add_subgoal'
  | 'browser_logs'
  | 'create_plan'
  | 'spawn_agents_async'
  | 'spawn_agent_inline'
  | 'update_subgoal'

export interface SecretAgentDefinition
  extends Omit<AgentDefinition, 'toolNames'> {
  /** Tools this agent can use. */
  toolNames?: AllToolNames[]
}
