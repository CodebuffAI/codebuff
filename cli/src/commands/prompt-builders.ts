/**
 * Centralized prompt builders for /plan and /review commands.
 * This ensures consistent behavior regardless of entry path.
 */

// Base prompt for plan command - always gathers context first
export const PLAN_BASE_PROMPT = 'Gather all the relevant context and then spawn @thinker Think about how to implement the following:'

// Base prompt for review command - always gathers context first
export const REVIEW_BASE_PROMPT = 'Please gather all relevant context and then spawn @thinker to review:'

/**
 * Build a plan prompt from user input.
 * @param input - The user's plan request (e.g., "add OAuth login")
 * @returns The full prompt to send to the agent
 */
export function buildPlanPrompt(input: string): string {
  const trimmedInput = input.trim()
  if (!trimmedInput) {
    return PLAN_BASE_PROMPT
  }
  return `${PLAN_BASE_PROMPT}\n\n${trimmedInput}`
}

const normalizePlanSessionTarget = (target: string): string => {
  const trimmed = target.trim()
  if (!trimmed) return trimmed
  // Strip a trailing artifact filename (e.g. PLAN.md) for display normalization.
  const sansFile = trimmed.endsWith('.md')
    ? trimmed.replace(/\/[^/]+\.md$/i, '')
    : trimmed
  if (sansFile.startsWith('.agents/sessions/') || sansFile.includes('/')) {
    return sansFile
  }
  return `.agents/sessions/${sansFile}`
}

export type PlanCommandArgs = {
  target: string
  note: string
}

/**
 * Split a durable-plan command's raw argument string into a normalized
 * session target plus an optional trailing note. Returns null when no
 * target slug/path was supplied.
 */
export function splitPlanCommandArgs(input: string): PlanCommandArgs | null {
  const trimmedInput = input.trim()
  if (!trimmedInput) return null

  const [target = '', ...noteParts] = trimmedInput.split(/\s+/)
  if (!target) return null
  return {
    target: normalizePlanSessionTarget(target),
    note: noteParts.join(' ').trim(),
  }
}

type ResumePlanInput = { target: string; artifactsText: string }
export function buildResumePlanPrompt(input: ResumePlanInput): string {
  return [
    `Resume the durable plan session at ${input.target}. Treat the artifact contents below as the source of truth — do not assume stale chat context is complete. Read STATUS.md and PLAN.md first to find the next actionable milestone, then continue execution. As you make progress, keep STATUS.md updated (current state, completed/pending/blocked items, next checkpoint) and append to LESSONS.md whenever you discover gotchas, decisions, or follow-up notes. Prefer the update_plan_status tool for incremental STATUS.md / LESSONS.md updates so the artifacts stay current without rewriting them whole; reserve create_plan for SPEC.md / PLAN.md edits, for any substantial rewrite, or for creating a missing artifact. Do not let STATUS.md/LESSONS.md drift behind the actual implementation state.`,
    '',
    'Existing artifacts:',
    input.artifactsText,
  ].join('\n')
}

type UpdatePlanInput = { target: string; artifactsText: string; note: string }
export function buildUpdatePlanPrompt(input: UpdatePlanInput): string {
  const note = input.note ? `\n\nUser note/context: ${input.note}` : ''
  return [
    `Inspect the durable plan artifacts at ${input.target} and revise them based on discovered reality. Use the create_plan tool for SPEC.md and PLAN.md edits, and for any substantial rewrite or for creating a missing artifact. For incremental STATUS.md and LESSONS.md updates (progress, blockers, checkpoints, newly discovered lessons), prefer the update_plan_status tool so the durable artifacts stay current without rewriting them whole. Include a concise rationale for every substantive change, keep task statuses/dependencies/validation gates current, and preserve resumability.${note}`,
    '',
    'Existing artifacts:',
    input.artifactsText,
  ].join('\n')
}

type LessonsInput = { target: string; artifactsText: string; note: string }
export function buildLessonsPrompt(input: LessonsInput): string {
  const note = input.note
    ? `\n\nUser note/context to incorporate: ${input.note}`
    : ''
  return [
    `Update LESSONS.md for the durable plan/session at ${input.target}. Prefer the update_plan_status tool for incremental LESSONS.md updates so the artifact stays current without rewriting it whole. Use create_plan only if LESSONS.md does not yet exist or needs a substantial rewrite. Capture reusable lessons, gotchas, decisions, and follow-up notes, and keep the entry concise and useful for future resume/update work.${note}`,
    '',
    'Existing artifacts:',
    input.artifactsText,
  ].join('\n')
}

// Base prompt for interview command - asks clarifying questions before acting
export const INTERVIEW_BASE_PROMPT = 'Interview me to better understand my request and then create a spec file. First, gather any relevant context (read files, do research, etc.). Then, use several rounds of the ask_user tool to ask non-obvious clarifying questions — things you cannot easily infer from the codebase or my initial message. Ask about edge cases, preferences, constraints, and design decisions. All questions should be directed through the ask_user tool -- not written out as text. Keep coming up with new questions that get at unique aspects of the request. Aim for at least **3 rounds** with multiple questions each round. When satisfied, write a [INSERT_REQUEST_SHORT_NAME]-spec.md file with all the information you have gathered about the request. Aim for as much detail as possible. You should NOT make any code changes yet. Stop after creating the spec file. End by using the suggest_followups tool with ways to flesh out the spec file. Here is my request:'

/**
 * Build an interview prompt from user input.
 * @param input - The user's request to be interviewed about
 * @returns The full prompt to send to the agent
 */
export function buildInterviewPrompt(input: string): string {
  const trimmedInput = input.trim()
  if (!trimmedInput) {
    return INTERVIEW_BASE_PROMPT
  }
  return `${INTERVIEW_BASE_PROMPT}\n\n${trimmedInput}`
}

/**
 * Review scope presets for the review screen.
 */
type ReviewScope = 'conversation' | 'uncommitted' | 'branch' | 'custom'

/**
 * Get the default text for a review scope preset.
 */
function getReviewScopeText(scope: ReviewScope): string {
  switch (scope) {
    case 'conversation':
      return 'all changes made in this conversation'
    case 'uncommitted':
      return 'uncommitted changes'
    case 'branch':
      return 'this branch compared to main'
    case 'custom':
      return ''
  }
}

/**
 * Build a review prompt from scope or custom input.
 * @param scope - The selected review scope (conversation, uncommitted, branch, or custom)
 * @param customInput - Optional custom review focus (when scope is 'custom')
 * @returns The full prompt to send to the agent
 */
export function buildReviewPrompt(scope: ReviewScope, customInput?: string): string {
  const scopeText = getReviewScopeText(scope)
  
  // For custom input, append the user's specific focus
  if (scope === 'custom' && customInput?.trim()) {
    return `${REVIEW_BASE_PROMPT} ${customInput.trim()}`
  }
  
  // For preset scopes, use the scope text
  if (scopeText) {
    return `${REVIEW_BASE_PROMPT} ${scopeText}`
  }
  
  // Fallback for custom with no input
  return REVIEW_BASE_PROMPT
}

/**
 * Build a review prompt from direct argument (e.g., /review foo).
 * This is used when the user provides review text directly after the command.
 * @param input - The user's review request
 * @returns The full prompt to send to the agent
 */
export function buildReviewPromptFromArgs(input: string): string {
  const trimmedInput = input.trim()
  // Use the same format as preset scopes for consistency
  return `${REVIEW_BASE_PROMPT} ${trimmedInput}`
}

