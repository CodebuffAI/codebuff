import { buildArray } from '@codebuff/common/util/array'

import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

export const createGeneralAgent = (options: {
  model: 'gpt-5' | 'opus'
}): Omit<SecretAgentDefinition, 'id'> => {
  const { model } = options
  const isGpt5 = model === 'gpt-5'

  return {
    publisher,
    model: isGpt5 ? 'openai/gpt-5.4' : 'anthropic/claude-opus-4.7',
    // General-agent does multi-step tool exploration that can run long on
    // large audits. Raise the wall-clock bound above the 20-min shared
    // default to give complex investigations room to complete.
    defaultTimeoutMs: 30 * 60 * 1000,
    ...(isGpt5 && {
      reasoningOptions: {
        effort: 'high' as const,
      },
    }),
    displayName: isGpt5 ? 'Deep Reasoning General Agent' : 'General Agent',
    spawnerPrompt:
      isGpt5 ?
        'A general-purpose, deep-thinking (and slow) agent that can be used to solve a wide range of problems. Use this to help you solve a specific problem that requires extended reasoning. This agent has no context on the conversation history so it cannot see files you have read or previous discussion. Instead, you must provide all the relevant context via the prompt or filePaths for this agent to work well.'
        : 'A general-purpose capable agent that can be used to solve a wide range of problems. Use this to help you solve any problem. This agent has no context on the conversation history so it cannot see files you have read or previous discussion. Instead, you must provide all the relevant context via the prompt or filePaths for this agent to work well.',
    inputSchema: {
      prompt: {
        type: 'string',
        description: 'The problem you are trying to solve',
      },
      params: {
        type: 'object',
        properties: {
          filePaths: {
            type: 'array',
            items: {
              type: 'string',
              description: 'The path to a file',
            },
            description:
              'A list of relevant file paths to read before thinking. Try to provide ALL the files that could be relevant to your request.',
          },
        },
      },
    },
    outputMode: 'last_message',
    spawnableAgents: buildArray(
      'researcher-web',
      'researcher-docs',
      !isGpt5 && 'file-picker',
      'code-searcher',
      'directory-lister',
      'glob-matcher',
      'basher',
      'context-pruner',
    ),
    toolNames: [
      'spawn_agents',
      'query_index',
      'read_files',
      'read_subtree',
      'str_replace',
      'write_file',
    ],

    instructionsPrompt: buildArray(
      `Use the spawn_agents tool to spawn agents to help you complete the user request.`,
      `For broad codebase questions or tasks where relevant files are not already obvious, call query_index early yourself to get indexed file candidates, then verify the best candidates with read_files/read_subtree and/or spawn file-picker/code-searcher agents as needed. Use query_index mode: 'explain' when you need ranking rationale, mode: 'neighbors' to expand around a known file, mode: 'path' to connect two known files, and mode: 'commands' to find package scripts, CI workflows, task runners, and validation docs. Do not rely on query_index alone for correctness.`,
      !isGpt5 && `If you need to find more information in the codebase, file-picker is really good at finding relevant files. You should spawn multiple agents in parallel when possible to speed up the process. (e.g. spawn 3 file-pickers + 1 code-searcher + 1 researcher-web in one spawn_agents call or 3 bashers in one spawn_agents call).`,
    ).join('\n'),

    handleSteps: function* ({ prompt, params }) {
      const filePaths = params?.filePaths as string[] | undefined

      if (filePaths && filePaths.length > 0) {
        yield {
          toolName: 'read_files',
          input: { paths: filePaths },
        }
      } else if (shouldProactivelyQueryIndex(prompt)) {
        yield {
          toolName: 'query_index',
          input: {
            query: prompt,
            limit: 20,
          },
        }
      }

      while (true) {
        // Run context-pruner before each step.
        // `spawn_agent_inline` is a secret-only tool (AllToolNames) not in the
        // public ToolName union that ToolCall<T> is keyed by, so a cast is
        // required here. See agents/base2/base2.ts for the same convention.
        yield {
          toolName: 'spawn_agent_inline',
          input: {
            agent_type: 'context-pruner',
            params: params ?? {},
          },
          includeToolCall: false,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- secret-only tool; see comment above
        } as any

        const { stepsComplete } = yield 'STEP'
        if (stepsComplete) break
      }

      function shouldProactivelyQueryIndex(value: unknown): value is string {
        if (typeof value !== 'string') return false
        const text = value.trim()
        if (text.length < 12) return false
        if (/^(hi|hello|hey|thanks|thank you|ok|okay)$/i.test(text)) return false
        return /\b(code|file|files|repo|repository|project|codebase|workspace|module|package|function|class|component|hook|api|schema|config|test|tests|implement|fix|debug|refactor)\b/i.test(text)
      }
    },
  }
}

const definition: SecretAgentDefinition = {
  ...createGeneralAgent({ model: 'opus' }),
  id: 'general-agent',
}

export default definition
