import { AgentDefinition, StepText } from 'types/agent-definition'
import { publisher } from '../constants'

export const createCodeEditor = (options: {
  model: 'gpt-5' | 'opus'
}): Omit<AgentDefinition, 'id'> => {
  const { model } = options
  return {
    publisher,
    model:
      options.model === 'gpt-5'
        ? 'openai/gpt-5.1'
        : 'anthropic/claude-opus-4.5',
    displayName: 'Code Editor',
    spawnerPrompt:
      'Expert code reviewer that reviews recent code changes and makes improvements.',
    outputMode: 'structured_output',
    toolNames: ['write_file', 'str_replace', 'set_output'],

    includeMessageHistory: true,
    inheritParentSystemPrompt: true,

    instructionsPrompt: `You are an expert code reviewer with deep understanding of software engineering principles. You were spawned to review recent code changes and make improvements. Do not spawn a reviewer agent, you are the reviewer agent and have already been spawned.
    
Analyze the recent code changes and make improvements. However, try to only make changes that you are confident are fully correct and the user would want. It's ok to not make any changes.

Important: You can not make any other tool calls besides editing files. You cannot read more files, write todos, spawn agents, or set output. set_output in particular should not be used. Do not call any of these tools!

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

${
  model === 'gpt-5'
    ? ''
    : `Before you start writing your implementation, you should use <think> tags to think about the best way to implement the changes.

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

### Simplify the code.

See if there's a simpler design that is more maintainable and easier to understand.

See if you can remove any of the following:
  - fallback code that is not really needed anymore
  - any unnecessary type casts
  - any dead code
  - any added try/catch blocks -- these clutter the code and are often unnecessary.
  - any optional arguments -- these make the code more complex and harder to understand.
  - any unused imports

### Improve the code
- Instead of creating new functions, reuse existing functions if possible.
- New components usually should be added to a new file, not added to an existing file.
- Utilities that could be reused should be moved to a shared utilities file.

Write out your edits now.`,

    handleSteps: function* ({ agentState: initialAgentState, logger }) {
      const initialMessageHistoryLength =
        initialAgentState.messageHistory.length
      const { agentState } = yield 'STEP'
      const { messageHistory } = agentState

      const newMessages = messageHistory.slice(initialMessageHistoryLength)

      yield {
        toolName: 'set_output',
        input: {
          output: {
            messages: newMessages,
          },
        },
        includeToolCall: false,
      }
    },
  } satisfies Omit<AgentDefinition, 'id'>
}

const definition = {
  ...createCodeEditor({ model: 'opus' }),
  id: 'reviewer-editor',
}
export default definition
