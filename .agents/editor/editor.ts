import { AgentDefinition, StepText } from 'types/agent-definition'
import { publisher } from '../constants'

export const createCodeEditor = (options: {
  model: 'gpt-5' | 'opus'
}): Omit<AgentDefinition, 'id'> => ({
  publisher,
  model:
    options.model === 'gpt-5' ? 'openai/gpt-5.1' : 'anthropic/claude-opus-4.5',
  displayName: 'Code Editor',
  spawnerPrompt:
    'Expert code editor. Do not specify an input prompt for this agent; it inherits the context of the entire conversation with the user. Make sure to read any files intended to be edited before spawning this agent as it cannot read files on its own.',
  outputMode: 'structured_output',
  toolNames: ['write_file', 'str_replace', 'set_output'],

  includeMessageHistory: true,
  inheritParentSystemPrompt: true,

  instructionsPrompt: `You are an expert code editor with deep understanding of software engineering principles. You were spawned to generate an implementation for the user's request.
    
Your task is to write out ALL the code changes needed to complete the user's request in a single comprehensive response.

Important: You can not make any other tool calls besides editing files. You cannot read more files, write todos, spawn agents, or set output. Do not call any of these tools!

Write out what changes you would make using the tool call format below. Use this exact format for each file change:

<codebuff_tool_call>
{
  "cb_tool_name": "str_replace",
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
  "cb_tool_name": "write_file",
  "path": "path/to/file",
  "instructions": "What the change does",
  "content": "Complete file content or edit snippet"
}
</codebuff_tool_call>

After the edit tool calls, you can optionally mention any follow-up steps to take, like deleting a file, or a sepcific way to validate the changes. There's no need to use the set_output tool as your entire response will be included in the output.

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

Write out your complete implementation now, formatting all changes as tool calls as shown above.`,

  handleSteps: function* ({ agentState: initialAgentState }) {
    const initialMessageHistoryLength = initialAgentState.messageHistory.length
    const { agentState } = yield 'STEP'
    const { messageHistory } = agentState

    const newMessages = messageHistory.slice(initialMessageHistoryLength)
    const assistantText = newMessages
      .filter((message) => message.role === 'assistant')
      .flatMap((message) => message.content)
      .filter((content) => content.type === 'text')
      .map((content) => content.text)
      .join('\n')

    const { agentState: postAssistantTextAgentState } = yield {
      type: 'STEP_TEXT',
      text: assistantText,
    } as StepText

    const postAssistantTextMessageHistory =
      postAssistantTextAgentState.messageHistory.slice(
        initialMessageHistoryLength,
      )
    const toolResults = postAssistantTextMessageHistory
      .filter((message) => message.role === 'tool')
      .flatMap((message) => message.content)
      .filter((content) => content.type === 'json')
      .map((content) => content.value)

    yield {
      toolName: 'set_output',
      input: {
        output: {
          message: assistantText,
          toolResults,
        },
      },
      includeToolCall: false,
    }
  },
})

const editor = createCodeEditor({ model: 'opus' })
export default editor
