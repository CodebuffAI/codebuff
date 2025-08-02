import type { AgentConfig } from '../../util/types/agent-config'
import type { DynamicAgentConfig } from '../dynamic-agent-template'

// Don't remove these lines!
const _typecheck1: AgentConfig extends DynamicAgentConfig ? true : false = true
const _typecheck2: DynamicAgentConfig extends AgentConfig ? true : false = true
const _keyTypecheck1: keyof AgentConfig = {} as keyof DynamicAgentConfig
const _keyTypecheck2: keyof DynamicAgentConfig = {} as keyof AgentConfig
