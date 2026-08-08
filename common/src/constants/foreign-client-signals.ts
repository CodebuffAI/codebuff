/**
 * Where a free-mode request goes when it did not come from a freebuff client.
 *
 * OpenRouter's `:free` variant, so a downgraded request costs nothing upstream
 * — which is the point. A caller proxying our free endpoint into their own
 * harness is spending our inference budget; serving them a free model spends
 * none of it. `getChatCompletionsProvider` has no branch for this slug and
 * falls through to `openrouter`, so nothing else needs to know about it.
 *
 * Verified against the OpenRouter catalog on 2026-08-08: 262k context, $0
 * prompt and completion, and `tools` + `tool_choice` in supported_parameters —
 * so a downgraded tool-calling request degrades rather than hard-erroring.
 */
export const FREEBUFF_DOWNGRADE_MODEL_ID = 'inclusionai/ling-3.0-tiny:free'

/**
 * Tool names that only a freebuff client sends.
 *
 * The discriminator is the tool schema rather than the system prompt because
 * the two are attacker-controlled in very different ways. A system prompt is
 * free to copy — ours ships in the CLI and is recoverable from any response —
 * so a prompt check is a speed bump. Tool schemas are not free to copy: a
 * harness dispatches on the tool name the model returns, so sending ours means
 * also executing ours and speaking our result format. Evading this check
 * converges on behaving like a real client, which is the outcome we want.
 *
 * DISTINCTIVE names only. The full `toolNames` list includes `glob`,
 * `web_search`, `skill` and `code_search`, which other harnesses also ship —
 * opencode alone sends `glob` and `web_search` — so matching on the full list
 * would clear the very traffic this is meant to catch. Every entry here must
 * stay in `toolNames`; the test asserts it, so a rename breaks CI instead of
 * silently emptying the signature.
 */
export const FREEBUFF_SIGNATURE_TOOL_NAMES: ReadonlySet<string> = new Set([
  'add_message',
  'add_subgoal',
  'ask_user',
  'browser_logs',
  'cloud_plan_ready',
  'end_turn',
  'find_files',
  'gravity_index',
  'list_directory',
  'lookup_agent_info',
  'propose_str_replace',
  'propose_write_file',
  'read_docs',
  'read_files',
  'read_subtree',
  'render_ui',
  'run_file_change_hooks',
  'run_terminal_command',
  'set_messages',
  'set_output',
  'spawn_agent_inline',
  'spawn_agents',
  'suggest_followups',
  'task_completed',
  'think_deeply',
  'update_subgoal',
  'write_todos',
])

export type ForeignClientSignal = 'foreign_toolset' | 'sampling_params'

export type ForeignClientVerdict = {
  /** Null when the request looks like it came from one of our clients. */
  signal: ForeignClientSignal | null
  toolCount: number
  /** A few offered tool names, for the log line. Bounded so logs stay small. */
  sampleToolNames: string[]
}

type InspectableRequest = {
  tools?: unknown
  temperature?: unknown
  top_p?: unknown
  max_tokens?: unknown
  max_completion_tokens?: unknown
}

/** Longest tool name kept for the log line. Names are caller-controlled, so an
 *  untruncated one is a log-flood vector; nothing legitimate is near this. */
const MAX_LOGGED_TOOL_NAME_LENGTH = 64

function readToolNames(tools: unknown): string[] {
  if (!Array.isArray(tools)) return []
  return tools
    .map((tool) =>
      typeof tool === 'object' && tool !== null
        ? (tool as { function?: { name?: unknown } }).function?.name
        : undefined,
    )
    .filter((name): name is string => typeof name === 'string')
}

/**
 * Whether a free-mode request came from something other than a freebuff client.
 *
 * Two signals, checked in a deliberate order:
 *
 *  1. The request offers tools and none of them are ours. Measured over 24h of
 *     DeepSeek V4 Flash traffic: 557 users / 75,741 requests.
 *  2. The request offers no tools but sets `temperature`, `top_p` or
 *     `max_tokens`. Our clients leave all three unset on 99.2% of requests.
 *
 * Signal 1 wins outright when it clears the request, and that ordering is the
 * whole safety story rather than a detail: 16 users in the same window send our
 * toolset *and* set sampling params (2,673 requests). Checking params first, or
 * checking them independently, would downgrade those users. Anyone sending our
 * tools is one of ours no matter what else the body says.
 */
export function detectForeignFreebuffClient(
  body: InspectableRequest,
): ForeignClientVerdict {
  const offered = readToolNames(body.tools)
  const sampleToolNames = offered
    .slice(0, 8)
    .map((name) => name.slice(0, MAX_LOGGED_TOOL_NAME_LENGTH))

  if (offered.length > 0) {
    const hasOurs = offered.some((name) =>
      FREEBUFF_SIGNATURE_TOOL_NAMES.has(name),
    )
    return {
      signal: hasOurs ? null : 'foreign_toolset',
      toolCount: offered.length,
      sampleToolNames,
    }
  }

  // Only reached when no tools were offered at all, so this can never override
  // the carve-out above.
  //
  // `!= null` deliberately, not `!== undefined`: a client that serializes its
  // whole request sends `"temperature": null` rather than omitting the key, and
  // that is unset, not a choice. Treating it as set downgraded every such
  // caller. This matches how the rest of the request path already reads these
  // fields — see `applyOpenRouterDefaultMaxTokens`, which gates on
  // `body.max_tokens != null` for the same reason.
  const setsSamplingParams =
    body.temperature != null ||
    body.top_p != null ||
    body.max_tokens != null ||
    body.max_completion_tokens != null
  return {
    signal: setsSamplingParams ? 'sampling_params' : null,
    toolCount: 0,
    sampleToolNames,
  }
}

/**
 * How much of the detection is allowed to change what a caller is served.
 *
 * `enforce-toolset` is the one to reach for. `enforce` also acts on the
 * sampling-param signal, which fires on our own tool-free traffic — 8,884
 * requests / 395 users on `base2-free-deepseek-flash` and 568 / 13 on
 * `code-reviewer-deepseek-flash` in a 24h sample, plus the CLI's own free-mode
 * shape, which sends `max_completion_tokens` with no tools.
 */
export type ForeignClientDowngradeMode =
  | 'off'
  | 'log'
  | 'enforce-toolset'
  | 'enforce'

export type ForeignClientDecision = ForeignClientVerdict & {
  signal: ForeignClientSignal
  /** The model to serve instead, or null to serve what was requested. */
  downgradeTo: string | null
}

/**
 * The whole policy in one place: detect, then decide whether this mode lets
 * that signal change the served model. Returns null when there is nothing to
 * report, so the caller's only job is to log and apply.
 */
export function resolveForeignClientDowngrade(params: {
  body: InspectableRequest & { model?: unknown }
  mode: ForeignClientDowngradeMode
}): ForeignClientDecision | null {
  const { body, mode } = params
  if (mode === 'off') return null

  const verdict = detectForeignFreebuffClient(body)
  if (!verdict.signal) return null

  const enforces =
    mode === 'enforce' ||
    (mode === 'enforce-toolset' && verdict.signal === 'foreign_toolset')

  return {
    ...verdict,
    signal: verdict.signal,
    // Never downgrade something already on the downgrade model: that would be
    // a no-op write that still reads as an enforcement in the logs.
    downgradeTo:
      enforces && body.model !== FREEBUFF_DOWNGRADE_MODEL_ID
        ? FREEBUFF_DOWNGRADE_MODEL_ID
        : null,
  }
}
