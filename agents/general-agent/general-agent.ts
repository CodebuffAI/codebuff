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
    ...(isGpt5 && {
      reasoningOptions: {
        effort: 'high' as const,
      },
    }),
    displayName: isGpt5 ? 'Deep Reasoning General Agent' : 'General Agent',
    spawnerPrompt: isGpt5
      ? 'A general-purpose, deep-thinking (and slow) agent that can be used to solve a wide range of problems. Use this to help you solve a specific problem that requires extended reasoning. This agent has no context on the conversation history so it cannot see files you have read or previous discussion. Instead, you must provide all the relevant context via the prompt or filePaths for this agent to work well.'
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
          sessionSlug: {
            type: 'string',
            description:
              'Durable audit session slug. When present with shardId, persist findings with write_audit_findings.',
          },
          shardId: {
            type: 'string',
            description:
              'Unique audit shard id used for the findings artifact filename.',
          },
          snapshotId: {
            type: 'string',
            description:
              'Exact structural snapshot id to bind into the audit shard receipt.',
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
      'context-pruner',
    ),
    toolNames: [
      'spawn_agents',
      'query_index',
      'read_files',
      'read_subtree',
      'write_audit_findings',
    ],
    filesystemScope: {
      read: ['**/*'],
      write: ['.agents/sessions/*/findings/*.md'],
    },
    programmaticToolNames: ['spawn_agent_inline'],

    instructionsPrompt: buildArray(
      `Use the spawn_agents tool to spawn agents to help you complete the user request.`,
      `For broad codebase questions or tasks where relevant files are not already obvious, call query_index early yourself to get indexed file candidates, then verify the best candidates with read_files/read_subtree and/or spawn file-picker/code-searcher agents as needed. Use query_index mode: 'explain' when you need ranking rationale, mode: 'neighbors' to expand around a known file, mode: 'path' to connect two known files, and mode: 'commands' to find package scripts, CI workflows, task runners, and validation docs. Do not rely on query_index alone for correctness.`,
      !isGpt5 &&
        `If indexed evidence leaves explicit coverage gaps, spawn bounded parallel waves of non-overlapping file-picker/code-searcher/researcher tasks. Join each wave before deciding whether more coverage is needed; do not restart the same discovery through multiple agent layers.`,
      `When params.sessionSlug and params.shardId are provided, this is a durable audit shard. params.snapshotId must be the exact inspect_codebase_structure snapshot; copy it into write_audit_findings.snapshotId. Analyze the assigned files, call write_audit_findings exactly once with structured findings and full subsystem/feature/file/domain coverage, then return only its compact artifact receipt, including structuralReceipt. Do not repeat findings in your final response.`,
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
        if (/^(hi|hello|hey|thanks|thank you|ok|okay)$/i.test(text))
          return false
        return /\b(code|file|files|repo|repository|project|codebase|workspace|module|package|function|class|component|hook|api|schema|config|test|tests|implement|fix|debug|refactor)\b/i.test(
          text,
        )
      }
    },
  }
}

const definition: SecretAgentDefinition = {
  ...createGeneralAgent({ model: 'opus' }),
  id: 'general-agent',
}

export default definition
