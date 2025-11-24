/**
 * Validation utilities for the ask_user tool
 * Full implementation in Phase 3
 */

/**
 * Validation result
 */
export interface ValidationResult {
  isValid: boolean
  error?: string
}

/**
 * Question validation rules (Phase 2/3 feature)
 */
export interface QuestionValidation {
  maxLength?: number
  minLength?: number
  pattern?: string
  patternError?: string
}

/**
 * Validate "Other" text input against rules
 * Phase 1: Basic length check only
 * Phase 3: Full validation with regex, custom errors
 */
export function validateOtherText(
  text: string,
  validation?: QuestionValidation,
  maxLength: number = 500
): ValidationResult {
  // Phase 1: Simple max length check
  if (text.length > maxLength) {
    return {
      isValid: false,
      error: `Max ${maxLength} characters`,
    }
  }

  // Phase 3 will add:
  // - minLength check
  // - pattern (regex) validation
  // - custom error messages

  if (validation) {
    if (validation.maxLength && text.length > validation.maxLength) {
      return {
        isValid: false,
        error: `Max ${validation.maxLength} characters`,
      }
    }

    if (validation.minLength && text.length < validation.minLength) {
      return {
        isValid: false,
        error: `Min ${validation.minLength} characters`,
      }
    }

    if (validation.pattern && text.length > 0) {
      const regex = new RegExp(validation.pattern)
      if (!regex.test(text)) {
        return {
          isValid: false,
          error: validation.patternError || 'Invalid format',
        }
      }
    }
  }

  return { isValid: true }
}

/**
 * Check if text input is empty or whitespace only
 */
export function isTextEmpty(text: string | undefined): boolean {
  return !text || !text.trim()
}

/**
 * Sanitize user input (remove control characters, excessive whitespace)
 */
export function sanitizeTextInput(text: string): string {
  return text
    .replace(/[\x00-\x1F\x7F]/g, ' ') // Replace control characters with space
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim()
}
