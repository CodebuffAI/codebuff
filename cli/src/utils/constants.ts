import type { ToolName } from '@codebuff/sdk'

import { getCliEnv } from './env'

/**
 * Freebuff build-time flag. When true, the CLI is built as Freebuff (free-only variant).
 * Injected via --define at compile time; enables dead-code elimination by the bundler.
 */
export const IS_FREEBUFF = getCliEnv().FREEBUFF_MODE === 'true'

/** Message shown when the user ends a freebuff session early. */
export const END_SESSION_MESSAGE =
  'Ending session and returning to the model picker…'

// Agent IDs that should not be rendered in the CLI UI. Matched as substrings
// so both bundled ids ('context-pruner') and publisher-qualified ids
// ('codebuff/context-pruner@1.0.0') are covered.
export const HIDDEN_AGENT_IDS = ['context-pruner'] as const

// Tool names that should be collapsed by default when rendered
// Uses ToolName type to ensure only valid tool names are added
export const COLLAPSED_BY_DEFAULT_TOOL_NAMES: readonly ToolName[] = [
  'set_output',
] as const

/**
 * Check if a tool should be collapsed by default
 */
export const shouldCollapseToolByDefault = (toolName: string): boolean => {
  return COLLAPSED_BY_DEFAULT_TOOL_NAMES.includes(toolName as ToolName)
}

/**
 * Check if an agent ID should be hidden from rendering
 */
export const shouldHideAgent = (agentId: string): boolean => {
  return HIDDEN_AGENT_IDS.some((hiddenId) => agentId.includes(hiddenId))
}

// Agent IDs that should be collapsed by default when they start
export const COLLAPSED_BY_DEFAULT_AGENT_IDS = [
  'file-picker',
  'code-reviewer-selector',
  'thinker-selector',
  'best-of-n-selector',
  'basher',
  'code-searcher',
  'directory-lister',
  'glob-matcher',
  'researcher-web',
  'researcher-docs',
] as const

/**
 * Check if an agent should be collapsed by default
 */
export const shouldCollapseByDefault = (agentType: string): boolean => {
  return COLLAPSED_BY_DEFAULT_AGENT_IDS.some((collapsedId) =>
    agentType.includes(collapsedId),
  )
}

/**
 * Rules for collapsing child agents when spawned by specific parent agents.
 * Key: parent agent type pattern, Value: array of child agent type patterns to collapse
 */
export const PARENT_CHILD_COLLAPSE_RULES: Record<string, string[]> = {
  'code-reviewer-multi-prompt': ['code-reviewer'],
}

/**
 * Check if a child agent should be collapsed when spawned by a specific parent
 */
export const shouldCollapseForParent = (
  childAgentType: string,
  parentAgentType: string | undefined,
): boolean => {
  if (!parentAgentType) {
    return false
  }

  for (const [parentPattern, childPatterns] of Object.entries(
    PARENT_CHILD_COLLAPSE_RULES,
  )) {
    if (parentAgentType.includes(parentPattern)) {
      for (const childPattern of childPatterns) {
        if (childAgentType.includes(childPattern)) {
          return true
        }
      }
    }
  }

  return false
}

// Agent IDs that should render as simple text instead of full agent boxes
export const SIMPLE_TEXT_AGENT_IDS = [
  'best-of-n-selector',
  'best-of-n-selector-gemini',
  'best-of-n-selector2',
] as const

/**
 * Check if an agent should render as simple text instead of a full agent box
 */
export const shouldRenderAsSimpleText = (agentType: string): boolean => {
  return SIMPLE_TEXT_AGENT_IDS.some((simpleTextId) =>
    agentType.includes(simpleTextId),
  )
}

// Agent IDs that show progress-focused previews (multi-prompt editors)
export const MULTI_PROMPT_EDITOR_IDS = ['editor-multi-prompt'] as const

/**
 * Check if an agent should show progress-focused preview when collapsed
 */
export const isMultiPromptEditor = (agentType: string): boolean => {
  return MULTI_PROMPT_EDITOR_IDS.some((id) => agentType.includes(id))
}

/**
 * The parent agent ID for all root-level agents
 */
export const MAIN_AGENT_ID = 'main-agent'

/**
 * Which harness the CLI's DEFAULT and LITE modes run.
 *
 * **base2, because base3 finishes less of the job on a weak model.** On
 * buffbench over 10 tasks with DeepSeek V4 Flash 07/31 — the default Freebuff
 * model — base3 averaged 7.16 to base2's 8.07, losing 6 tasks, winning 3 and
 * tying 1. The losses are the large ones (−4.5, −2.5, −1.7) and they are
 * incompleteness rather than wrong code: the judges' weaknesses carry twice the
 * "did not implement / did not update" language for base3 (1.9 per task vs
 * 1.0), and base3 ran ~30% faster on 9 of 10 tasks. It explores less and has no
 * reviewer to catch what it skipped; Opus absorbs that and Flash does not.
 *
 * On Opus the same comparison was a wash (8.88 vs 8.97 over 3 tasks) at half
 * the cost, which is why this shipped before the free tier was measured.
 *
 * Everything base3 needs is still here and still tested — the roots, the
 * factory, the eval agents. Flipping this one constant to 'base3' switches
 * DEFAULT, LITE and every Freebuff picker model back over, which is the point:
 * the next attempt should be a one-line change plus a re-run of
 * `evals/buffbench/main-flash-harness.ts`.
 */
export const CLI_HARNESS: 'base2' | 'base3' = 'base2'

/** The only two modes that follow CLI_HARNESS. MAX and PLAN never moved, so
 *  they are not in here — listing them per harness would invite editing one row
 *  and not the other. */
const HARNESS_MODE_IDS = {
  base2: { DEFAULT: 'base2', LITE: 'base2-lite' },
  base3: { DEFAULT: 'base3', LITE: 'base3-lite' },
} as const

/**
 * Mapping from agent mode to agent ID.
 * Single source of truth for all agent modes (order = cycling order).
 *
 * Freebuff resolves LITE through the selected freebuff model at send time;
 * this fallback stays on base2-free for non-runtime callers. Regular
 * Codebuff maps LITE to a paid lite root which charges credits normally.
 *
 * MAX and PLAN never moved to base3 and are unaffected by CLI_HARNESS. MAX is
 * the mode users pick when they want the multi-prompt editor and the reviewer
 * fan-out — the ceremony IS the product there. PLAN never touches a file, so
 * windowed reads and single-loop-instead-of-subagents buy it nothing, and its
 * `<PLAN>` flow (see sdk-event-handlers.ts) is tuned against base2's plan-only
 * prompt. Same reasoning that kept the Freebuff Cloud planner on base2.
 */
export const AGENT_MODE_TO_ID = {
  DEFAULT: HARNESS_MODE_IDS[CLI_HARNESS].DEFAULT,
  LITE: IS_FREEBUFF ? 'base2-free' : HARNESS_MODE_IDS[CLI_HARNESS].LITE,
  MAX: 'base2-max',
  PLAN: 'base2-plan',
} as const

export type AgentMode = keyof typeof AGENT_MODE_TO_ID
export const AGENT_MODES = Object.keys(AGENT_MODE_TO_ID) as AgentMode[]

/**
 * Maps CLI agent mode to cost mode for billing.
 *
 * Freebuff's LITE maps to 'free' cost mode (session gate, rate limits, 0 credits
 * for allowlisted agent+model combos). Regular Codebuff's LITE maps to 'lite' —
 * a normal paid mode (charges credits, no session gate, no country restrictions).
 */
export const AGENT_MODE_TO_COST_MODE = {
  DEFAULT: 'normal',
  LITE: IS_FREEBUFF ? 'free' : 'lite',
  MAX: 'max',
  PLAN: 'normal',
} as const satisfies Record<
  AgentMode,
  'free' | 'lite' | 'normal' | 'max' | 'experimental' | 'ask'
>
