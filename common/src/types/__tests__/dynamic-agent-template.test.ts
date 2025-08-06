import type { AgentConfig } from '../../util/types/agent-config'
import type { DynamicAgentConfig } from '../dynamic-agent-template'

// Create a version of DynamicAgentConfig where handleSteps is compatible with AgentConfig
type DynamicAgentConfigHandleSteps = Omit<DynamicAgentConfig, 'handleSteps'> & {
  handleSteps?: AgentConfig['handleSteps']
}

// Don't remove these lines! And don't change the values away from true!
const _typecheck1: AgentConfig extends DynamicAgentConfigHandleSteps
  ? true
  : false = true
const _typecheck2: DynamicAgentConfigHandleSteps extends AgentConfig
  ? true
  : false = true
// These two give nicer to read type errors. Let's keep them.
const a: DynamicAgentConfigHandleSteps = {} as DynamicAgentConfigHandleSteps
const b: AgentConfig = {} as DynamicAgentConfigHandleSteps
const _keyTypecheck1: keyof AgentConfig =
  {} as keyof DynamicAgentConfigHandleSteps
const _keyTypecheck2: keyof DynamicAgentConfigHandleSteps =
  {} as keyof AgentConfig
