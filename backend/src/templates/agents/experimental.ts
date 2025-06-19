import { AgentTemplate, baseAgentToolNames, PLACEHOLDER } from '../types'

export const experimental: AgentTemplate = {
  name: 'experimental',
  description:
    'Experimental agent using Gemini 2.5 Pro Preview with advanced reasoning',
  model: 'gemini-2.5-pro-preview-06-05',
  toolNames: baseAgentToolNames,

  systemPrompt: `${PLACEHOLDER.TOOLS_PROMPT}`,
  userInputPrompt: `${PLACEHOLDER.TOOLS_PROMPT}`,
  agentStepPrompt: `<system>
You have ${PLACEHOLDER.REMAINING_STEPS_PROMPT} more response(s) before you will be cut off and the turn will be ended automatically.</system>

Assistant cwd (project root): ${PLACEHOLDER.PROJECT_ROOT_PROMPT}
User cwd: ${PLACEHOLDER.USER_CWD}
</system>`,
}
