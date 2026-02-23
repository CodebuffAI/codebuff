import { publisher } from '../../constants'

import type { SecretAgentDefinition } from '../../types/secret-agent-definition'

export const createBestOfNImplementor = (options: {
  model: 'sonnet' | 'opus' | 'gpt-5' | 'gemini'
}): Omit<SecretAgentDefinition, 'id'> => {
  const { model } = options
  const isSonnet = model === 'sonnet'
  const isOpus = model === 'opus'
  const isGpt5 = model === 'gpt-5'
  const isGemini = model === 'gemini'

  return {
    publisher,
    model: isSonnet
      ? 'anthropic/claude-sonnet-4.5'
      : isOpus
        ? 'anthropic/claude-opus-4.6'
        : isGemini
          ? 'google/gemini-3-pro-preview'
          : 'openai/gpt-5.1',
    displayName: 'Implementation Generator',
    spawnerPrompt:
      'Generates a complete implementation using propose_* tools that draft changes without applying them',

    includeMessageHistory: true,
    inheritParentSystemPrompt: true,

    toolNames: ['propose_write_file', 'propose_str_replace'],
    spawnableAgents: [],

    inputSchema: {},
    outputMode: 'structured_output',

    instructionsPrompt: `You are an expert code editor with deep understanding of software engineering principles. You were spawned to generate an implementation for the user's request.
    
Your task is to write out ALL the code changes needed to complete the user's request.

IMPORTANT: Use propose_str_replace and propose_write_file tools to make your edits. These tools draft changes without actually applying them - they will be reviewed first. DO NOT use any other tools. Do not spawn any agents, read files, or set output.

You can make multiple tool calls across multiple steps to complete the implementation. Only the file changes will be passed on, so you can say whatever you want to help you think. Do not write any final summary as that would be a waste of tokens because no one is reading it.
<codebuff_tool_call>
{
  "cb_tool_name": "propose_str_replace",
  "path": "path/to/file",
  "replacements": [
    {
      "old": "exact old code",
      "new": "exact new code"
    },
    {
      "old": "exact old code 2",
      "new": "exact new code 2"
    },
  ]
}
</codebuff_tool_call>

OR for new files or major rewrites:

<codebuff_tool_call>
{
  "cb_tool_name": "propose_write_file",
  "path": "path/to/file",
  "instructions": "What the change does",
  "content": "Complete file content"
}
</codebuff_tool_call>
${isGpt5 || isGemini
        ? ``
        : `
IMPORTANT: Before you start writing your implementation, you should use <think> tags to think about the best way to implement the changes. You should think really really hard to make sure you implement the changes in the best way possible. Take as much time as you to think through all the cases to produce the best changes.

You can also use <think> tags interspersed between tool calls to think about the best way to implement the changes.

<example>

<think>
[ Long think about the best way to implement the changes ]
</think>

<codebuff_tool_call>
[ First tool call to implement the feature ]
</codebuff_tool_call>

<codebuff_tool_call>
[ Second tool call to implement the feature ]
</codebuff_tool_call>

<think>
[ Thoughts about a tricky part of the implementation ]
</think>

<codebuff_tool_call>
[ Third tool call to implement the feature ]
</codebuff_tool_call>

</example>`
      }

After the edit tool calls, you can optionally mention any follow-up steps to take, like deleting a file, or a specific way to validate the changes. There's no need to use the set_output tool as your entire response will be included in the output.

Your implementation should:
- Be complete and comprehensive
- Include all necessary changes to fulfill the user's request
- Follow the project's conventions and patterns
- Be as simple and maintainable as possible
- Reuse existing code wherever possible
- Be well-structured and organized

More style notes:
- Extra try/catch blocks clutter the code -- use them sparingly.
- Optional arguments are code smell and worse than required arguments.
- New components often should be added to a new file, not added to an existing file.

Write out your complete implementation now. Do not write any final summary.`,

    handleSteps: function* ({ agentState: initialAgentState }) {
      const initialMessageHistoryLength =
        initialAgentState.messageHistory.length

      const { agentState } = yield 'STEP_ALL'

      const postMessages = agentState.messageHistory.slice(
        initialMessageHistoryLength,
      )

      // Extract tool calls from assistant messages
      const toolCalls: { toolName: string; input: any }[] = []
      for (const message of postMessages) {
        if (message.role !== 'assistant' || !Array.isArray(message.content))
          continue
        for (const part of message.content) {
          if (part.type === 'tool-call') {
            toolCalls.push({
              toolName: part.toolName,
              input: part.input ?? (part as any).args ?? {},
            })
          }
        }
      }

      // Extract tool results (unified diffs) from tool messages
      const toolResults: any[] = []
      for (const message of postMessages) {
        if (message.role !== 'tool' || !Array.isArray(message.content)) continue
        for (const part of message.content) {
          if (part.type === 'json' && part.value) {
            toolResults.push(part.value)
          }
        }
      }

      // Concatenate all unified diffs for the selector to review
      const unifiedDiffs = toolResults
        .filter((result: any) => result.unifiedDiff)
        .map((result: any) => `--- ${result.file} ---\n${result.unifiedDiff}`)
        .join('\n\n')

      yield {
        toolName: 'set_output',
        input: {
          toolCalls,
          toolResults,
          unifiedDiffs,
        },
        includeToolCall: false,
      }
    },
  }
}
const definition = {
  ...createBestOfNImplementor({ model: 'opus' }),
  id: 'editor-implementor',
}
export default definition
