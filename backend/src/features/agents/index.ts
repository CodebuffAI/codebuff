// Agents feature exports
export { mainPrompt } from './execution/main-prompt'
export { loopAgentSteps, runAgentStep } from './execution/run-agent-step'
export { loopMainPrompt } from './execution/loop-main-prompt'
export { agentRegistry } from './templates/static/agent-registry'
export { dynamicAgentService } from './templates/static/dynamic-agent-service'
export type { AgentTemplate, AgentTemplateUnion } from './templates/static/types'
