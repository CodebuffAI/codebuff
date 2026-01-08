import {
  PLACEHOLDER,
  type SecretAgentDefinition,
} from '../../.agents/types/secret-agent-definition'
import { publisher } from '../../.agents/constants'

const definition: SecretAgentDefinition = {
  id: 'planner-pro-with-files-input',
  model: 'openai/gpt-5-pro',
  publisher,
  displayName: 'Planner Pro',
  spawnerPrompt:
    'Uses deep thinking to generate an implementation plan for a user request.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'A coding task to complete',
    },
    params: {
      type: 'object',
      properties: {
        researchReport: {
          type: 'string',
          description: 'A research report on the user request',
        },
        relevantFiles: {
          type: 'array',
          items: {
            type: 'string',
            description:
              'The path to a file that is relevant to the user request',
          },
          description:
            'The paths to files that are relevant to the user request',
        },
      },
      required: ['relevantFiles'],
    },
  },
  outputMode: 'last_message',
  spawnableAgents: [],

  systemPrompt: `You are the planner-pro agent. You are an expert software engineer which is good at formulating surprisingly simple and clear plans.

IMPORTANT: You do not have access to any tools. You can only analyze and write out plans. Do not attempt to use any tools! Your goal is to generate the best plan for the user's request.

${PLACEHOLDER.FILE_TREE_PROMPT_SMALL}`,

  instructionsPrompt: `Your task is to output the best plan to accomplish the user's request in a single message. Do not call any tools.

The plan should be an implementation plan for the coding agent to act on to satisfy the user's request. So you can give instructions to the coding agent that include at a high level what files to change and what commands/tools to run.

No need to write out all the code that should be changed. Just focus on the trickiest parts, the key decisions, and sketch the rest so that a smart coding agent can fill in the details.

You can excerpt key sections of the code using markdown code blocks, e.g.

path/to/file.ts
\`\`\`
// ... existing code ...
[this is is the key section of code]
// ... existing code ...
\`\`\`

Here is a priority-ordered list of key principles for the plan. You must:
- Satisfy all the original user requirements to the greatest extent possible.
- Create the simplest and most straightforward plan to implement.
- Make the plan maintainable, clear, and easy to understand.
- Include the fewest dependencies and moving parts.
- Reuse existing helper functions and other code whenever possible.
- Modify the fewest files.

Please output the plan text itself, without labels or meta-commentary.`,

  handleSteps: function* ({ params }) {
    yield {
      toolName: 'read_files',
      input: { paths: params?.relevantFiles || [] },
    }

    yield 'STEP_ALL'
  },
}

export default definition
