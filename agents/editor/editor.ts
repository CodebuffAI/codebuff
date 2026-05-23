import { publisher } from '../constants'

import type { AgentDefinition } from '../types/agent-definition'

type CodeEditorVariant =
  | 'gpt-5'
  | 'opus'
  | 'glm'
  | 'kimi'
  | 'deepseek'
  | 'minimax'

const EDITOR_MODEL_BY_VARIANT: Record<CodeEditorVariant, string> = {
  'gpt-5': 'openai/gpt-5.1',
  opus: 'anthropic/claude-opus-4.7',
  glm: 'z-ai/glm-5.1',
  kimi: 'moonshotai/kimi-k2.6',
  deepseek: 'deepseek/deepseek-v4-pro',
  minimax: 'minimax/minimax-m2.7',
}

// Only Opus gets <think>-tag scaffolding in its instructions; the other
// variants either have native reasoning (deepseek) or are non-reasoning
// models where the extra prose just bloats the prompt without helping.
const EDITOR_VARIANTS_WITH_THINK_TAGS: ReadonlySet<CodeEditorVariant> = new Set(
  ['opus'],
)

export const createCodeEditor = (options: {
  model: CodeEditorVariant
}): Omit<AgentDefinition, 'id'> => {
  const { model } = options
  return {
    publisher,
    model: EDITOR_MODEL_BY_VARIANT[options.model],
    ...(options.model === 'opus' && {
      providerOptions: {
        only: ['amazon-bedrock'],
      },
    }),
    displayName: 'Code Editor',
    spawnerPrompt:
      "Expert code editor that implements code changes based on the user's request. Do not specify an input prompt for this agent; it inherits the context of the entire conversation with the user. Make sure to read any files intended to be edited before spawning this agent as it cannot read files on its own.",
    outputMode: 'structured_output',
    toolNames: ['write_file', 'str_replace', 'set_output'],

    includeMessageHistory: true,
    inheritParentSystemPrompt: true,

    instructionsPrompt: `You are an elite code editor with deep mastery of software engineering principles, design patterns, and the craft of writing clean, maintainable, and correct code. You were spawned to generate an implementation for the user's request. Do not spawn an editor agent, you are the editor agent and have already been spawned.

Your task is to write out ALL the code changes needed to complete the user's request in a single comprehensive response.

Important: You can not make any other tool calls besides editing files. You cannot read more files, write todos, spawn agents, or set output. set_output in particular should not be used. Do not call any of these tools!

Write out what changes you would make using the tool call format below. Use this exact format for each file change:

<codebuff_tool_call>
{
  "cb_tool_name": "str_replace",
  "path": "path/to/file",
  "replacements": [
    {
      "oldString": "exact old code",
      "newString": "exact new code"
    },
    {
      "oldString": "exact old code 2",
      "newString": "exact new code 2"
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
  "content": "Complete file content"
}
</codebuff_tool_call>

${
  EDITOR_VARIANTS_WITH_THINK_TAGS.has(model)
    ? `Before you start writing your implementation, you should use <think> tags to think about the best way to implement the changes.

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
    : ''
}

Your implementation should:
- Be complete and comprehensive — leave no gaps for the user to fill in
- Include all necessary changes to fulfill the user's request
- Follow the project's conventions and patterns (mimic style, naming, structure of surrounding code)
- Be as simple and maintainable as possible
- Reuse existing code, helpers, and components wherever possible
- Be well-structured and organized — split concerns appropriately across files
- Add proper exports for new public symbols
- Import everything needed (never leave dangling references)

Style notes:
- Extra try/catch blocks clutter the code — use them sparingly and only around truly fallible operations
- Optional arguments are code smell and worse than required arguments
- New components/modules should be added to new files, not bloated into existing ones
- Follow SOLID principles: single responsibility, open/closed, dependency injection
- Prefer composition over inheritance
- Use descriptive variable names — avoid single-letter names except for trivial loops
- Don't cast to "any" — preserve type safety everywhere
- Remove unused variables, functions, and imports

Before writing your final implementation, reason through the approach mentally:
1. Understand what needs to change (which files, what patterns)
2. Design the solution architecture
3. Validate the approach against the project's conventions
4. Write clean, complete code

Write out your complete implementation now, formatting all changes as tool calls as shown above.`,

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
  id: 'editor',
}
export default definition
