import { buildArray } from '@codebuff/common/util/array'

import { publisher } from '../.agents/constants'
import { type SecretAgentDefinition } from '../.agents/types/secret-agent-definition'

import type { ToolCall } from 'types/agent-definition'
import type { UserMessage } from 'types/util-types'

export const createBase2WithTaskResearcher: () => Omit<
  SecretAgentDefinition,
  'id'
> = () => {
  return {
    publisher,
    model: 'anthropic/claude-sonnet-4.5',
    displayName: 'Buffy the Orchestrator',
    spawnerPrompt:
      'Advanced base agent that orchestrates planning, editing, and reviewing for complex coding tasks',
    inputSchema: {
      prompt: {
        type: 'string',
        description: 'A coding task to complete',
      },
      params: {
        type: 'object',
        properties: {
          maxContextLength: {
            type: 'number',
          },
        },
        required: [],
      },
    },
    outputMode: 'last_message',
    includeMessageHistory: false,
    toolNames: [
      'spawn_agents',
      'spawn_agent_inline',
      'read_files',
      'str_replace',
      'write_file',
    ],
    spawnableAgents: buildArray(
      'task-researcher2',
      'file-picker',
      'code-searcher',
      'directory-lister',
      'glob-matcher',
      'researcher-web',
      'researcher-docs',
      'commander',
      'planner-pro-with-files-input',
      'base2-gpt-5-worker',
      'context-pruner',
    ),

    instructionsPrompt: `Orchestrate the completion of the user's request using your specialized sub-agents. Take your time and be comprehensive.
    
## Example workflow

The user asks you to implement a new feature. You respond in multiple steps:

1. Spawn a task-researcher2 agent by itself to research the task and get key facts and insights.
2. Spawn a planner-pro-with-files-input agent to generate a plan for the changes.
3. Spawn a base2-gpt-5-worker agent to do the editing.
4. Test your changes by running appropriate validation commands for the project (e.g. typechecks, tests, lints, etc.). You may have to explore the project to find the appropriate commands.
5. Inform the user that you have completed the task in one sentence or a few short bullet points without a final summary. Don't create any summary markdown files, unless asked by the user.

You may not need to spawn the task-researcher2 if the user's request is trivial or if you have already gathered all the information you need from the conversation history.
`,

    stepPrompt: `Don't forget to spawn agents that could help, especially: the task-researcher2 to research the task, and base2-gpt-5-worker to do the editing. After completing the user request, summarize your changes in a sentence or a few short bullet points. Do not create any summary markdown files, unless asked by the user. Then, end your turn.`,

    handleSteps: function* ({ params, logger }) {
      let steps = 0
      while (true) {
        steps++
        // Run context-pruner before each step
        yield {
          toolName: 'spawn_agent_inline',
          input: {
            agent_type: 'context-pruner',
            params: params ?? {},
          },
          includeToolCall: false,
        } as any

        const { stepsComplete, agentState } = yield 'STEP'
        if (stepsComplete) break

        // Check last tool result for spawning of a task researcher...
        const spawnAgentsToolResults = agentState.messageHistory
          .filter((message) => message.role === 'tool')
          .slice(-1)
          .filter((message) => message.toolName === 'spawn_agents')
          .map((message) => message.content)
          .flat()
          .filter((result) => result.type === 'json')
          .map((result) => result.value)[0] as {
          agentType: string
          value: any
        }[]

        const taskResearcherResult = spawnAgentsToolResults?.find(
          (result) => result.agentType === 'task-researcher2',
        )
        if (taskResearcherResult) {
          // If task researcher was spawned:
          // 1. Reset context from the last user message.
          // 2. Read all the relevant files using the read_files tool.
          // 3. Spawn a planner-pro agent with the appropriate context (prompt, research report, and relevantFiles).
          // 4. Spawn a base2-gpt-5-worker agent to implement the plan.
          // 4. Step all

          const taskResearcherOutput = taskResearcherResult.value.value as {
            report: string
            relevantFiles: string[]
          }

          const lastUserMessageIndex = agentState.messageHistory.findLastIndex(
            (message) =>
              message.role === 'user' &&
              (typeof message.content === 'string'
                ? message.content
                : message.content[0].type === 'text'
                  ? message.content[0].text
                  : ''
              ).includes('<user_message>'),
          )
          const lastUserMessage = agentState.messageHistory[
            lastUserMessageIndex
          ] as UserMessage
          const userPrompt = !lastUserMessage
            ? ''
            : typeof lastUserMessage.content === 'string'
              ? lastUserMessage.content
              : lastUserMessage.content
                  .filter((content) => content.type === 'text')
                  .map((content) => content.text)
                  .join()
          const userPromptText = userPrompt
            .split('<user_message>')[1]
            .split('</user_message>')[0]
            .trim()

          const newMessages =
            agentState.messageHistory.slice(lastUserMessageIndex)
          yield {
            toolName: 'set_messages',
            input: {
              messages: newMessages,
            },
            includeToolCall: false,
          } satisfies ToolCall<'set_messages'>

          yield {
            toolName: 'read_files',
            input: { paths: taskResearcherOutput.relevantFiles },
          } satisfies ToolCall<'read_files'>

          yield {
            toolName: 'spawn_agents',
            input: {
              agents: [
                {
                  agent_type: 'planner-pro-with-files-input',
                  prompt: userPromptText,
                  params: {
                    researchReport: taskResearcherOutput.report,
                    relevantFiles: taskResearcherOutput.relevantFiles,
                  },
                },
              ],
            },
          } satisfies ToolCall<'spawn_agents'>

          yield {
            toolName: 'spawn_agent_inline',
            input: {
              agent_type: 'base2-gpt-5-worker',
            },
          }
        }
        // Continue loop!
      }
    },
  }
}

const definition = {
  ...createBase2WithTaskResearcher(),
  id: 'base2-with-task-researcher',
}
export default definition
