import { type ToolCall } from '../types/agent-definition'
import { createBase2 } from './base2'
import { type SecretAgentDefinition } from '../types/secret-agent-definition'

const definition: SecretAgentDefinition = {
  ...createBase2('default'),
  id: 'base2-read-moar',
  displayName: 'Buffy Needs Moar Files',

  handleSteps: function* ({ params }) {
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

      // Check last tool result for a read_files tool call...
      const readFilesToolResults = agentState.messageHistory
        .filter((message) => message.role === 'tool')
        .slice(-1)
        .filter((message) => message.content.toolName === 'read_files')
        .map((message) => message.content.output)
        .flat()
        .filter((result) => result.type === 'json')
        .map((result) => result.value)[0] as {
        path: string
        content: string
      }[][][0]
      if (readFilesToolResults) {
        // Check last tool result for spawning of a file researcher...
        const spawnAgentsToolResults = agentState.messageHistory
          .filter((message) => message.role === 'tool')
          .slice(-2)
          .filter((message) => message.content.toolName === 'spawn_agents')
          .map((message) => message.content.output)
          .flat()
          .filter((result) => result.type === 'json')
          .map((result) => result.value)[0] as {
          agentType: string
          value: any
        }[]

        const fileResearcherResult = spawnAgentsToolResults?.find(
          (result) => result.agentType === 'file-researcher',
        )
        if (fileResearcherResult) {
          const fileResearcherOutput = fileResearcherResult.value.value as {
            report: string
            relevantFiles: string[]
          }
          const newPaths = fileResearcherOutput.relevantFiles.filter(
            (path) =>
              !readFilesToolResults.some((result) => result.path === path),
          )
          if (newPaths.length > 0) {
            yield {
              toolName: 'add_message',
              input: {
                role: 'assistant',
                content: `Let me read more files to get more context.`,
              },
              includeToolCall: false,
            } satisfies ToolCall<'add_message'>

            // Instead of forcing these files, let the model decide which files to read next.
            // yield {
            //   toolName: 'read_files',
            //   input: { paths: newPaths },
            // } satisfies ToolCall<'read_files'>
            yield 'STEP'

            yield {
              toolName: 'add_message',
              input: {
                role: 'assistant',
                content: `Let me read even more files complete my understanding of the user's request.`,
              },
              includeToolCall: false,
            }
          }
        }
      }

      if (stepsComplete) break
    }
  },
}
export default definition
