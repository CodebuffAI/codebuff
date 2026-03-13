/**
 * Centralized prompt builders for /plan and /review commands.
 * This ensures consistent behavior regardless of entry path.
 */

// Base prompt for plan command - always gathers context first
export const PLAN_BASE_PROMPT = 'Gather all the relevant context and then spawn @thinker-gpt Think about how to implement the following:'

// Base prompt for review command - always gathers context first
export const REVIEW_BASE_PROMPT = 'Please gather all relevant context and then spawn @thinker-gpt to review:'

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

/**
 * Review scope presets for the review screen.
 */
type ReviewScope = 'uncommitted' | 'branch' | 'custom'

/**
 * Get the default text for a review scope preset.
 */
function getReviewScopeText(scope: ReviewScope): string {
  switch (scope) {
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
 * @param scope - The selected review scope (uncommitted, branch, or custom)
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

