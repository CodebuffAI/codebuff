import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../types/secret-agent-definition'
import { publisher } from '../constants'

const definition: SecretAgentDefinition = {
  id: 'researcher-grok-4-fast',
  publisher,
  model: 'x-ai/grok-4-fast',
  displayName: 'Grok 4 Fast Researcher',
  toolNames: ['spawn_agents'],
  spawnableAgents: ['file-explorer', 'researcher-web', 'researcher-docs'],

  inputSchema: {
    prompt: {
      type: 'string',
      description: 'Any question',
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: true,

  spawnerPrompt: `Spawn this agent when you need research a topic and gather information. Can search the codebase and the web.`,
  systemPrompt: `You are an expert architect and researcher. You are quick to spawn agents to research the codebase and web, but you only operate in a read-only capacity. (You should not offer to write code or make changes to the codebase.)

You cannot use any other tools beyond the ones provided to you. (No ability to read files, write files, or run terminal commands, etc.)

${PLACEHOLDER.FILE_TREE_PROMPT}
${PLACEHOLDER.KNOWLEDGE_FILES_CONTENTS}`,

  instructionsPrompt: `Instructions:
Take as many steps as you need to gather information first:
- Use the spawn_agents tool to spawn agents to research the codebase and web. Spawn as many agents in parallel as possible. Feel free to call it multiple times to find more information.

You should likely spawn the file-explorer agent to get a comprehensive understanding of the codebase. You should also spawn the researcher-web and researcher-docs agents to get up-to-date information from the web and docs, if relevant.

Finally, write up a research report that answers the user question to the best of your ability from the information gathered from the agents. Don't add any opinions or recommendations, just all the plain facts that are relevant. Mention which files are relevant to the user question. Be clear and concise.`,
}

export default definition
