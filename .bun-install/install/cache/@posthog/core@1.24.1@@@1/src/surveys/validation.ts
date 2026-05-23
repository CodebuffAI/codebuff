import { SurveyValidationRule, SurveyValidationType } from '../types'

/**
 * Validates a survey open text response.
 * Returns an error message string if invalid, or false if valid.
 */
export function getValidationError(
  value: string,
  rules: SurveyValidationRule[] | undefined,
  optional: boolean | undefined
): string | false {
  const trimmed = value.trim()

  // Required check (with whitespace fix) - applies to ALL required questions
  if (!optional && trimmed === '') {
    return 'This field is required'
  }

  // If optional and empty, skip other validations
  if (trimmed === '') {
    return false
  }

  // Apply validation rules (only if configured)
  if (rules && rules.length > 0) {
    for (const rule of rules) {
      switch (rule.type) {
        case SurveyValidationType.MinLength:
          if (rule.value !== undefined && trimmed.length < rule.value) {
            return rule.errorMessage ?? `Please enter at least ${rule.value} characters`
          }
          break

        case SurveyValidationType.MaxLength:
          if (rule.value !== undefined && trimmed.length > rule.value) {
            return rule.errorMessage ?? `Please enter no more than ${rule.value} characters`
          }
          break
      }
    }
  }

  return false
}

/**
 * Helper to extract a length value from validation rules by type
 */
export function getLengthFromRules(
  rules: SurveyValidationRule[] | undefined,
  type: SurveyValidationType
): number | undefined {
  if (!rules) return undefined
  const rule = rules.find((r) => r.type === type)
  return rule?.value
}

/**
 * Builds a requirements hint message for display to the user.
 * Returns undefined if no hint should be shown.
 *
 * min=1 is always hidden because:
 * - Required questions: min=1 is redundant (required already means "enter something")
 * - Optional questions: min=1 is useless (user can skip, or if they type anything it's ≥1 char)
 */
export function getRequirementsHint(minLength: number | undefined, maxLength: number | undefined): string | undefined {
  // Skip showing hint for min=1 - it's always redundant/useless
  const effectiveMin = minLength === 1 ? undefined : minLength

  if (effectiveMin && maxLength) {
    return `Enter ${effectiveMin}-${maxLength} characters`
  } else if (effectiveMin) {
    const plural = effectiveMin === 1 ? 'character' : 'characters'
    return `Enter at least ${effectiveMin} ${plural}`
  } else if (maxLength) {
    const plural = maxLength === 1 ? 'character' : 'characters'
    return `Maximum ${maxLength} ${plural}`
  }
  return undefined
}
