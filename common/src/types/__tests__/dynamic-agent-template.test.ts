import type { AgentDefinition } from '../../templates/initial-agents-dir/types/agent-definition'
import type { publishedTools } from '../../tools/constants'
import type { DynamicAgentDefinition } from '../dynamic-agent-template'

// Create a version of DynamicAgentDefinition where handleSteps is compatible with AgentDefinition

type DynamicAgentDefinitionHandleSteps = Omit<
  DynamicAgentDefinition,
  'handleSteps' | 'toolNames'
> & {
  handleSteps?: AgentDefinition['handleSteps']
  toolNames?: (typeof publishedTools)[number][]
}
// Don't remove these lines! And don't change the values away from true!
const _typecheck1: AgentDefinition extends DynamicAgentDefinitionHandleSteps
  ? true
  : false = true
const _typecheck2: DynamicAgentDefinitionHandleSteps extends AgentDefinition
  ? true
  : false = true
// These two give nicer to read type errors. Let's keep them.
const a: DynamicAgentDefinitionHandleSteps =
  {} as DynamicAgentDefinitionHandleSteps
const b: AgentDefinition = {} as DynamicAgentDefinitionHandleSteps
const _keyTypecheck1: keyof AgentDefinition =
  {} as keyof DynamicAgentDefinitionHandleSteps
const _keyTypecheck2: keyof DynamicAgentDefinitionHandleSteps =
  {} as keyof AgentDefinition
