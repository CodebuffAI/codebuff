/**
 * The thread agent — the single full coding agent the human talks to in a thread.
 * Unlike the old orchestrator (which only mutated a task graph), this agent does
 * the real work: it reads and edits files in the thread's git worktree, runs
 * commands, and ships changes. It runs once per turn with `previousRun` threaded
 * through so prompt caching carries across the conversation.
 *
 * Custom tools wire it back to the engine:
 *  - suggest_prompts — propose follow-up prompts that park in the queue's
 *    suggested lane (replaces the old Scout).
 *  - write_doc       — append durable learnings to a governing doc (used by the
 *    `reflect` skill); surfaces the length-cap error so the agent condenses.
 *  - browser_check   — load the thread's work in a real headless browser.
 *
 * Shipping (commit/push/open-PR/merge) is done by the agent itself via
 * `run_terminal_command` (see the `open-pr` / `merge` skills), not a tool.
 */

import { getCustomToolDefinition } from '@codebuff/sdk'
import type { AgentDefinition, CustomToolDefinition } from '@codebuff/sdk'
import { z } from 'zod/v4'

import basher from '../../../../agents/basher'
import codeSearcher from '../../../../agents/file-explorer/code-searcher'
import filePicker from '../../../../agents/file-explorer/file-picker'
import fileLister from '../../../../agents/file-explorer/file-lister'
import researcherDocs from '../../../../agents/researcher/researcher-docs'
import researcherWeb from '../../../../agents/researcher/researcher-web'
import { FREEBUFF_MODEL } from '../models'
import { SUGGEST_PROMPTS_GUIDANCE, THREAD_TOOL_SPECS, type ThreadToolDeps } from './thread-tools'

/** A focused but real coding tool set (mirrors the base coding agent). */
export const THREAD_AGENT_TOOLS = [
  'spawn_agents',
  'read_files',
  'read_subtree',
  'list_directory',
  'glob',
  'code_search',
  'str_replace',
  'write_file',
  'run_terminal_command',
  'run_file_change_hooks',
  'set_output',
  'end_turn',
]

/**
 * The subagents the thread agent can spawn — the same exploration/research crew
 * the free `base2` orchestrator uses. These run on cheap, fast models and report
 * back into collapsible boxes in the transcript. file-picker itself spawns
 * file-lister, so the tree nests one level deeper.
 *
 * The SDK only resolves `spawnableAgents` ids it's handed: we pass the full
 * transitive closure (these defs + file-lister) to `run({ agentDefinitions })`.
 * Kept to free-safe, dependency-free agents — the browser/tmux/reviewer/GPT
 * subagents base2 also lists are omitted to avoid flaky external requirements.
 */
export const THREAD_SPAWNABLE_AGENTS = [
  'file-picker',
  'code-searcher',
  'researcher-web',
  'researcher-docs',
  'basher',
] as const

/** Definitions handed to the SDK so the spawnable ids above (and file-picker's
 *  own child, file-lister) resolve at spawn time. */
export const THREAD_SUBAGENT_DEFINITIONS: AgentDefinition[] = [
  filePicker as AgentDefinition,
  fileLister as AgentDefinition,
  codeSearcher as AgentDefinition,
  researcherWeb as AgentDefinition,
  researcherDocs as AgentDefinition,
  basher as AgentDefinition,
]

const THREAD_SYSTEM_PROMPT = `You are Freebuff, a capable coding agent working directly in this repository's
git worktree. You implement what the user asks: read the relevant code, make
focused edits, run commands to verify, and keep the working tree in a good state.

How to work:
- Do the task well and completely. Read surrounding code before changing it; match
  the existing style and conventions.
- Delegate exploration to subagents instead of spending your own steps on it. Spawn
  them with spawn_agents — in parallel when the searches are independent — and wait
  for their reports before editing:
    • file-picker — find the files relevant to a task (give it a focused prompt).
    • code-searcher — locate where a symbol / string / pattern is used.
    • researcher-web — look something up on the web (APIs, errors, libraries).
    • researcher-docs — search the project's / a framework's documentation.
    • basher — run a read-only shell command and summarize its output.
  Gather context up front with a batch of subagents, then make focused edits yourself
  with str_replace / write_file. Don't spawn a subagent for something you can do in
  one direct tool call.
- Verify your work by running the project's commands when it matters (build, tests,
  or exercising the actual surface). Rendering is not correctness.
- Be concise in your prose. The user is watching a live transcript.

${SUGGEST_PROMPTS_GUIDANCE}

Do not commit or open a PR unless the user (or the open-pr / merge skill) asks you to.`

export function threadAgentDefinition(
  toolNames: string[],
  model: string = FREEBUFF_MODEL,
): AgentDefinition {
  return {
    id: 'freebuff-desktop-thread',
    displayName: 'Freebuff',
    model,
    toolNames,
    spawnableAgents: [...THREAD_SPAWNABLE_AGENTS],
    systemPrompt: THREAD_SYSTEM_PROMPT,
    instructionsPrompt:
      'Work in the current repository. Spawn file-picker / code-searcher to find ' +
      'relevant code before editing, and other subagents as needed. Be concise.',
  } as AgentDefinition
}

type ToolResult = { type: 'json'; value: any }

/**
 * Codebuff adapter: wrap each shared {@link THREAD_TOOL_SPECS} entry as a
 * Codebuff `CustomToolDefinition`. The Claude Code harness wraps the same specs
 * as MCP tools (see buildFreebuffMcpTools); the descriptions/schemas/logic live
 * once in thread-tools.ts.
 */
export function buildThreadTools(deps: ThreadToolDeps): CustomToolDefinition<string, any, any>[] {
  return THREAD_TOOL_SPECS.map((spec) =>
    getCustomToolDefinition({
      toolName: spec.name,
      description: spec.description,
      inputSchema: z.object(spec.shape),
      endsAgentStep: false,
      exampleInputs: spec.exampleInputs as any,
      execute: async (input): Promise<ToolResult[]> => [
        { type: 'json', value: await spec.run(deps, input) },
      ],
    }),
  )
}
