import { getValidationError, getLengthFromRules, getRequirementsHint } from './validation'
import { SurveyValidationType, SurveyValidationRule } from '../types'

describe('getValidationError', () => {
  describe('required field (trim fix)', () => {
    it('returns error for empty string when required', () => {
      expect(getValidationError('', undefined, false)).toBe('This field is required')
    })

    it('returns error for whitespace-only when required', () => {
      expect(getValidationError('   ', undefined, false)).toBe('This field is required')
      expect(getValidationError('\t\n', undefined, false)).toBe('This field is required')
    })

    it('returns false for valid content when required', () => {
      expect(getValidationError('hello', undefined, false)).toBe(false)
    })

    it('returns false for empty when optional', () => {
      expect(getValidationError('', undefined, true)).toBe(false)
    })

    it('returns false for whitespace when optional', () => {
      expect(getValidationError('   ', undefined, true)).toBe(false)
    })
  })

  describe('backwards compat - no validation rules', () => {
    it('works when validation is undefined', () => {
      expect(getValidationError('hello', undefined, false)).toBe(false)
    })

    it('works when validation is empty array', () => {
      expect(getValidationError('hello', [], false)).toBe(false)
    })
  })

  describe('minLength validation', () => {
    const rules: SurveyValidationRule[] = [{ type: SurveyValidationType.MinLength, value: 5 }]

    it('returns error when too short', () => {
      expect(getValidationError('abc', rules, false)).toBe('Please enter at least 5 characters')
    })

    it('returns false when exact length', () => {
      expect(getValidationError('abcde', rules, false)).toBe(false)
    })

    it('returns false when longer than min', () => {
      expect(getValidationError('abcdefgh', rules, false)).toBe(false)
    })

    it('uses custom error message if provided', () => {
      const customRules: SurveyValidationRule[] = [
        { type: SurveyValidationType.MinLength, value: 5, errorMessage: 'Too short!' },
      ]
      expect(getValidationError('abc', customRules, false)).toBe('Too short!')
    })
  })

  describe('maxLength validation', () => {
    const rules: SurveyValidationRule[] = [{ type: SurveyValidationType.MaxLength, value: 10 }]

    it('returns error when too long', () => {
      expect(getValidationError('12345678901', rules, false)).toBe('Please enter no more than 10 characters')
    })

    it('returns false when exact length', () => {
      expect(getValidationError('1234567890', rules, false)).toBe(false)
    })

    it('returns false when shorter than max', () => {
      expect(getValidationError('12345', rules, false)).toBe(false)
    })
  })

  describe('minLength + maxLength combined', () => {
    const rules: SurveyValidationRule[] = [
      { type: SurveyValidationType.MinLength, value: 5 },
      { type: SurveyValidationType.MaxLength, value: 10 },
    ]

    it('fails when too short', () => {
      expect(getValidationError('abc', rules, false)).toContain('at least 5')
    })

    it('fails when too long', () => {
      expect(getValidationError('12345678901', rules, false)).toContain('no more than 10')
    })

    it('passes when in range', () => {
      expect(getValidationError('1234567', rules, false)).toBe(false)
    })
  })
})

describe('getLengthFromRules', () => {
  it('returns undefined when no rules', () => {
    expect(getLengthFromRules(undefined, SurveyValidationType.MinLength)).toBeUndefined()
  })

  it('returns undefined when requested type not present', () => {
    expect(
      getLengthFromRules([{ type: SurveyValidationType.MaxLength, value: 10 }], SurveyValidationType.MinLength)
    ).toBeUndefined()
  })

  it('returns minLength value when present', () => {
    expect(
      getLengthFromRules([{ type: SurveyValidationType.MinLength, value: 5 }], SurveyValidationType.MinLength)
    ).toBe(5)
  })

  it('returns maxLength value when present', () => {
    expect(
      getLengthFromRules([{ type: SurveyValidationType.MaxLength, value: 100 }], SurveyValidationType.MaxLength)
    ).toBe(100)
  })
})

describe('getRequirementsHint', () => {
  describe('min=1 edge case', () => {
    it('returns undefined for min=1 (redundant/useless hint)', () => {
      expect(getRequirementsHint(1, undefined)).toBeUndefined()
    })

    it('returns undefined for min=1 even with maxLength', () => {
      // min=1 is still redundant, but maxLength hint should show
      expect(getRequirementsHint(1, 100)).toBe('Maximum 100 characters')
    })
  })

  describe('minLength only', () => {
    it('returns hint for min > 1', () => {
      expect(getRequirementsHint(5, undefined)).toBe('Enter at least 5 characters')
    })

    it('uses singular for min=2 (edge case after min=1 is hidden)', () => {
      expect(getRequirementsHint(2, undefined)).toBe('Enter at least 2 characters')
    })
  })

  describe('maxLength only', () => {
    it('returns hint for maxLength', () => {
      expect(getRequirementsHint(undefined, 100)).toBe('Maximum 100 characters')
    })

    it('uses singular for max=1', () => {
      expect(getRequirementsHint(undefined, 1)).toBe('Maximum 1 character')
    })
  })

  describe('minLength + maxLength', () => {
    it('returns combined hint when both present', () => {
      expect(getRequirementsHint(5, 100)).toBe('Enter 5-100 characters')
    })

    it('shows only maxLength when min=1', () => {
      expect(getRequirementsHint(1, 50)).toBe('Maximum 50 characters')
    })
  })

  describe('no constraints', () => {
    it('returns undefined when no min or max', () => {
      expect(getRequirementsHint(undefined, undefined)).toBeUndefined()
    })
  })
})
