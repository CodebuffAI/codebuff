
import { publisher } from '../constants'

import type { AgentDefinition } from '../types/agent-definition'

export const createCodeEditor = (options: {
  model: 'gpt-5' | 'opus' | 'minimax'
}): Omit<AgentDefinition, 'id'> => {
  const { model } = options
  return {
    publisher,
    model:
      options.model === 'gpt-5'
        ? 'openai/gpt-5.4'
        : options.model === 'minimax'
          ? 'minimax/minimax-m2.5'
          : 'anthropic/claude-opus-4.6',
    ...(options.model === 'opus' && {
      providerOptions: {
        only: ['amazon-bedrock'],
      },
    }),
    displayName: 'Editor',
    spawnerPrompt:
      "Expert code editor that implements code changes based on the user's request. Do not specify an input prompt for this agent; it inherits the context of the entire conversation with the user. Make sure to gather as much context as possible and read any related files (be extremely comprehensive!) before spawning this agent as it cannot read files on its own.",
    outputMode: 'structured_output',
    toolNames: [
      // 'read_files',
      // 'read_subtree',
      // 'skill',
      // 'set_output',
      // 'code_search',
      // 'list_directory',
      // 'glob',
      'write_file',
      'str_replace',
      'patch_file'
    ],
    spawnableAgents: [
      // 'file-picker',
      // 'researcher-web',
      // 'researcher-docs',
      // 'basher',
      // 'tmux-cli',
      // 'browser-use',
      // 'context-pruner',
    ],
    includeMessageHistory: true,
    systemPrompt: `You are a code editor called upon solely to modify files without using other tools. After you finish, another agent will complete the overall task, including running the type checker, running tests, etc. Your job is only to do one pass on the file editing.`,
    instructionsPrompt: `You are an expert code editor with deep understanding of software engineering principles. You were spawned to generate an implementation for the user's request. Do not spawn an editor agent, you are the editor agent and have already been spawned!
    
Your task is to write out ALL the code changes needed to complete the user's request in a single comprehensive response.

Important: You DO NOT have access to tools other than patch_file, write_file, or str_replace file editing tools. You cannot read more files, search the codebase, use glob patterns, run terminal commands (e.g. running the type checker), or use any other tools. You must implement the changes with the context you have already gathered. The rest of the task will be finished by another agent.

${model === 'opus'
        ? `Before you start writing your implementation, you should use <think> tags to think about the best way to implement the changes.

You can also use <think> tags interspersed between tool calls to think about the best way to implement the changes.

<example>

<think>
[ Long think about the best way to implement the changes ]
</think>

[ First tool call to implement the feature ]

[ Second tool call to implement the feature ]

<think>
[ Thoughts about a tricky part of the implementation ]
</think>

[ Third tool call to implement the feature ]

...

[ Last tool call to implement the feature ]
</example>` : ''}

Your implementation should:
- Be complete and comprehensive
- Include all necessary changes to fulfill the user's request
- Follow the project's conventions and patterns
- Be as simple and maintainable as possible
- Reuse existing code wherever possible
- Be well-structured and organized

More style notes:
- Try/catch blocks clutter the code -- use them sparingly.
- Optional arguments are code smell -- better to use required arguments.
- New components often should be added to a new file, not added to an existing file.

Write out your complete implementation now. Your job is only to make these specific changes and not to do anything else (e.g. do not use terminal commands, do not review the code, do not write any final summary). You must stop abruptly as soon as you have made the last edit.`,

    handleSteps: function* ({ agentState: initialAgentState, logger }) {
      const initialMessageHistoryLength =
        initialAgentState.messageHistory.length
      const { agentState } = yield 'STEP_ALL'
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
  ...createCodeEditor({ model: 'gpt-5' }),
  id: 'editor-gpt',
}
export default definition
