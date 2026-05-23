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
        ? 'anthropic/claude-opus-4.7'
        : isGemini
          ? 'google/gemini-3-pro-preview'
          : 'openai/gpt-5.5',
    ...(isOpus && {
      providerOptions: {
        only: ['amazon-bedrock'],
      },
    }),
    ...(isGpt5 && {
      reasoningOptions: {
        effort: 'low',
      },
    }),
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

IMPORTANT: Your response must contain at least one propose_str_replace or propose_write_file tool call. Use those tools to make your edits. These tools draft changes without actually applying them - they will be reviewed first. DO NOT use any other tools. Do not spawn any agents, read files, or set output. Do not spend time narrating or thinking out loud; emit all needed proposal tool calls in one response, then stop.

When using text/XML tool calling, every proposal must be a valid JSON object inside <codebuff_tool_call>...</codebuff_tool_call>. Do not wrap the JSON in markdown fences. Do not use trailing commas.

You can make multiple tool calls across multiple steps to complete the implementation. Only the file changes will be passed on, so you can say whatever you want to help you think. Do not write any final summary as that would be a waste of tokens because no one is reading it.
<codebuff_tool_call>
{
  "cb_tool_name": "propose_str_replace",
  "path": "path/to/file",
  "replacements": [
    {
      "oldString": "exact old code",
      "newString": "exact new code"
    },
    {
      "oldString": "exact old code 2",
      "newString": "exact new code 2"
    }
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
${
  isGpt5 || isGemini
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

      let agentState = initialAgentState
      const maxProposalSteps = 3

      for (let step = 0; step < maxProposalSteps; step++) {
        const result = yield 'STEP'
        agentState = result.agentState

        const postMessages = agentState.messageHistory.slice(
          initialMessageHistoryLength,
        )
        const hasProposalToolResult = postMessages.some(
          (message) =>
            message.role === 'tool' &&
            (message.toolName === 'propose_str_replace' ||
              message.toolName === 'propose_write_file'),
        )

        // Proposal agents only need to draft edits. Once at least one
        // propose_* tool has run, stop immediately instead of asking the model
        // for another turn. Do not treat a plain no-tool final answer as done:
        // OpenAI-compatible models commonly end the step after prose/thinking
        // or malformed XML, and the parent multi-editor would receive an empty
        // proposal that cannot be selected or applied.
        if (hasProposalToolResult) {
          break
        }

        if (step === maxProposalSteps - 1) {
          break
        }

        yield {
          toolName: 'set_messages',
          input: {
            messages: [
              ...agentState.messageHistory,
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: `Your previous response did not execute a proposal edit tool. Immediately emit exactly one or more valid XML tool calls with the required code changes. Do not continue thinking or narrating.

Use this exact shape with valid JSON and no markdown fences:
<codebuff_tool_call>
{"cb_tool_name":"propose_str_replace","path":"path/to/file","replacements":[{"oldString":"exact old code","newString":"exact new code"}]}
</codebuff_tool_call>

Or:
<codebuff_tool_call>
{"cb_tool_name":"propose_write_file","path":"path/to/file","instructions":"what changed","content":"complete file content"}
</codebuff_tool_call>`,
                  },
                ],
                tags: ['PROPOSAL_RETRY'],
              },
            ],
          },
          includeToolCall: false,
        }
      }

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
