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
  'gpt-5': 'openai/gpt-5.5',
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
    displayName: 'Code Editor',
    spawnerPrompt:
      "Expert code editor that implements code changes based on the user's request. Do not specify an input prompt for this agent; it inherits the context of the entire conversation with the user. Read any clearly intended files before spawning when possible; the editor can also read exact target files to recover missing or stale edit context.",
    outputMode: 'structured_output',
    toolNames: ['read_files', 'write_file', 'str_replace', 'set_output'],

    includeMessageHistory: true,
    inheritParentSystemPrompt: true,

    instructionsPrompt: `You are an expert code editor with deep understanding of software engineering principles. You were spawned to generate an implementation for the user's request. Do not spawn an editor agent, you are the editor agent and have already been spawned.
    
Your task is to write out ALL the code changes needed to complete the user's request, across every file that must change.

You may make edits across multiple turns. After each edit you will see whether it applied successfully:
- If a str_replace fails because the oldString did not match the file exactly, read the error, then retry with a corrected oldString (copy the exact current text) or fall back to write_file with the complete file content.
- Keep editing until the entire request is implemented across all files. Do not stop after a single file when more files still need changes.
- When every change has been made and all edits have applied successfully, stop: respond with a brief one-line confirmation and make no further tool calls.

Important: You may call read_files only for exact files you need to edit or to recover after a failed/stale str_replace. You cannot search, write todos, spawn agents, or set output. set_output in particular should not be used. Do not call any unsupported tools!

Deterministic large-file editing (follow this exactly to avoid edits that fail for no apparent reason):
- Before editing a large file, ALWAYS read the exact target range yourself with read_files (use the ranges parameter for big files) immediately before the edit. Never reuse a basedOnRead capability token that came from the parent agent or from a read you did before any intervening edit — those are stale and will be rejected even though the file is readable.
- Copy the basedOnRead readCapability token verbatim from the header of your own most recent read of that exact range, and put it on each replacement that touches a large file.
- To make several edits to the same file, batch them into ONE str_replace call with multiple replacements (each with its own basedOnRead). All replacements in a single call are validated against the same pre-edit file, so they will not invalidate each other. Do NOT make multiple separate single-edit calls to the same large file in a row — each successful edit changes line numbers and makes the next call's pre-edit anchor stale.
- After any successful edit to a file, treat every basedOnRead token for that file as stale: re-read the relevant range before the next edit to it.
- If an edit is rejected because the anchor/line count looks stale, do not retry from memory: re-read the exact current range first, then make one edit based on that fresh read.

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
      const initialMessageHistoryLength =
        initialAgentState.messageHistory.length

      // Keep stepping while the model is still emitting edit tool calls so it
      // can implement multi-file changes and recover from failed str_replaces.
      // Bounded to avoid runaway loops on models that never stop calling tools.
      const maxEditSteps = 12
      let agentState = initialAgentState
      for (let step = 0; step < maxEditSteps; step++) {
        const result = yield 'STEP'
        agentState = result.agentState
        if (result.stepsComplete) break
      }

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
