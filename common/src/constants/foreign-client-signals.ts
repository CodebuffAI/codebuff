import { toolNames } from '../tools/constants'

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
 * Tool names we define that other agent harnesses also ship.
 *
 * Maintained as an EXCLUSION list, with the signature derived from it, because
 * the inclusion list rotted: `researcher-web` offers exactly
 * `['web_search', 'read_url']`, and a hand-picked signature that happened to
 * omit both flagged 100% of its 334,042 requests from 4,821 users over 30 days.
 * Any tool added to `toolNames` now joins the signature automatically, so the
 * failure mode is a new *generic* name we forget to list here — which flags a
 * third party we could already flag, rather than silently downgrading our own
 * users.
 *
 * Each entry carries the third-party usage that justifies it, so this stays
 * evidence rather than superstition.
 */
export const GENERIC_TOOL_NAMES: ReadonlySet<string> = new Set([
  // Counts are distinct users, over 30 days, on requests carrying NO signature
  // tool at all — i.e. unambiguously third-party harnesses. Anything without
  // that evidence belongs in the signature: excluding a name we define costs us
  // nothing against proxies and risks flagging whichever agent of ours uses it
  // alone, which is exactly how researcher-web broke.
  'write_file', // 3,372 users (Cline)
  'web_search', // 3,273 users (opencode)
  'glob', // 2,691 users (opencode, Claude Code ships `Glob`)
  'skill', // 2,257 users
  'apply_patch', // 1,137 users (Codex)
])

/**
 * Tools our own surfaces define outside `toolNames`, via
 * `customToolDefinitions`. Freebuff Desktop's autorun agent
 * (freebuff-desktop/src/server/services/autorun.ts) offers exactly `decide` and
 * nothing else, so without this it had no signature tool at all and was flagged
 * on 100% of its 2,904 requests from 41 users over 30 days.
 */
export const FREEBUFF_CUSTOM_TOOL_NAMES = ['decide'] as const

/**
 * Tool names that, on their own, mark a request as coming from one of our
 * clients: everything we define that is not generic.
 *
 * The discriminator is the tool schema rather than the system prompt because
 * the two are attacker-controlled in very different ways. A system prompt is
 * free to copy — ours ships in the CLI and is recoverable from any response —
 * so a prompt check is a speed bump. Tool schemas are not free to copy: a
 * harness dispatches on the tool name the model returns, so sending ours means
 * also executing ours and speaking our result format. Evading this check
 * converges on behaving like a real client, which is the outcome we want.
 */
export const FREEBUFF_SIGNATURE_TOOL_NAMES: ReadonlySet<string> = new Set([
  ...(toolNames as readonly string[]).filter(
    (name) => !GENERIC_TOOL_NAMES.has(name),
  ),
  ...FREEBUFF_CUSTOM_TOOL_NAMES,
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
 *  1. The request offers tools and not one of them is distinctively ours.
 *     Measured over 24h of DeepSeek V4 Flash traffic: 557 users / 75,741
 *     requests.
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
    const hasSignatureTool = offered.some((name) =>
      FREEBUFF_SIGNATURE_TOOL_NAMES.has(name),
    )
    return {
      signal: hasSignatureTool ? null : 'foreign_toolset',
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

export type ForeignClientDecision = ForeignClientVerdict & {
  signal: ForeignClientSignal
  /** The model to serve instead, or null to serve what was requested. */
  downgradeTo: string | null
}

/**
 * Detect, then decide whether the signal changes what is served.
 *
 * `foreign_toolset` always downgrades. Using a third-party client against this
 * endpoint is a terms violation, not a grey area: Freebuff funds free
 * inference with ads that only our own clients render, so a proxied request
 * takes the cost and returns none of the revenue.
 *
 * `sampling_params` is reported but never enforced. It fires on our own
 * tool-free traffic — 8,884 requests / 395 users on
 * `base2-free-deepseek-flash` and 568 / 13 on `code-reviewer-deepseek-flash` in
 * a 24h sample, plus the CLI's own free-mode shape, which sends
 * `max_completion_tokens` with no tools. It stays as a measurement.
 */
export function resolveForeignClientDowngrade(params: {
  body: InspectableRequest & { model?: unknown }
}): ForeignClientDecision | null {
  const { body } = params
  const verdict = detectForeignFreebuffClient(body)
  if (!verdict.signal) return null

  return {
    ...verdict,
    signal: verdict.signal,
    // Never downgrade something already on the downgrade model: that would be
    // a no-op write that still reads as an enforcement in the logs.
    downgradeTo:
      verdict.signal === 'foreign_toolset' &&
      body.model !== FREEBUFF_DOWNGRADE_MODEL_ID
        ? FREEBUFF_DOWNGRADE_MODEL_ID
        : null,
  }
}
