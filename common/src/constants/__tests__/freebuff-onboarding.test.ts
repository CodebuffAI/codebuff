import { describe, expect, it } from 'bun:test'

import {
  classifyOnboardingOtherText,
  FREEBUFF_ONBOARDING_QUESTIONS,
  isOnboardingComplete,
  ONBOARDING_LEGACY_OPTION_IDS,
  ONBOARDING_OTHER_TEXT_MAX,
  OTHER_OPTION_ID,
  validateOnboardingSubmission,
  type OnboardingAnswer,
} from '../freebuff-onboarding'

/** A complete, valid submission. */
function fullAnswers(overrides: OnboardingAnswer[] = []): OnboardingAnswer[] {
  const base: OnboardingAnswer[] = [
    { questionId: 'referral_source', optionIds: ['youtube'] },
    { questionId: 'role', optionIds: ['professional_dev'] },
    { questionId: 'proficiency', optionIds: ['advanced'] },
    { questionId: 'intended_use', optionIds: ['work', 'side_projects'] },
    { questionId: 'subscriptions', optionIds: ['cursor'] },
  ]
  return base.map((a) => overrides.find((o) => o.questionId === a.questionId) ?? a)
}

describe('the question set itself', () => {
  it('gives every option a unique id within its question', () => {
    // A duplicate id would silently merge two distinct answers in the analytics.
    for (const q of FREEBUFF_ONBOARDING_QUESTIONS) {
      const ids = q.options.map((o) => o.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('offers Other everywhere except the ordinal scale', () => {
    // Free text on an ordered scale is unusable for the segmentation the
    // question exists to support.
    for (const q of FREEBUFF_ONBOARDING_QUESTIONS) {
      const hasOther = q.options.some((o) => o.id === OTHER_OPTION_ID)
      expect(hasOther).toBe(q.id !== 'proficiency')
    }
  })

  it('maps every legacy option onto an option that still exists', () => {
    // A successor that no longer exists silently drops the answers it was
    // supposed to rescue — the exact failure the map exists to prevent.
    for (const [questionId, map] of Object.entries(ONBOARDING_LEGACY_OPTION_IDS)) {
      const question = FREEBUFF_ONBOARDING_QUESTIONS.find((q) => q.id === questionId)
      expect(question).toBeDefined()
      const live = new Set(question!.options.map((o) => o.id))
      for (const [retired, successor] of Object.entries(map ?? {})) {
        expect(live.has(retired)).toBe(false)
        expect(live.has(successor)).toBe(true)
      }
    }
  })

  it('only marks options exclusive on multi-select questions', () => {
    // On a single-choice question "exclusive" is meaningless, and reading as
    // though it does something is worse than not having it.
    for (const q of FREEBUFF_ONBOARDING_QUESTIONS) {
      if (q.multi) continue
      expect(q.options.some((o) => o.exclusive)).toBe(false)
    }
  })
})

describe('classifyOnboardingOtherText — write-ins folded into real options', () => {
  it('counts every Instagram spelling as the Instagram / TikTok option', () => {
    for (const text of ['insta', 'Instagram', 'instagram ads', 'IG', 'tik tok']) {
      expect(classifyOnboardingOtherText('referral_source', text)).toBe('tiktok')
    }
  })

  it('counts AI assistants as the Google / AI search option', () => {
    for (const text of ['ChatGPT', 'chat gpt', 'AI', 'gemini', 'perplexity']) {
      expect(classifyOnboardingOtherText('referral_source', text)).toBe('search')
    }
  })

  it('prefers the more specific rule when a write-in matches both', () => {
    expect(classifyOnboardingOtherText('referral_source', 'instagram AI page')).toBe(
      'tiktok',
    )
  })

  it('leaves genuinely other answers alone', () => {
    // The AI rule is the dangerous one: a substring match would swallow
    // "email", "said", "chair" and quietly inflate a channel that never
    // referred anyone.
    for (const text of ['forums', 'my brother', 'email newsletter', 'a fair']) {
      expect(classifyOnboardingOtherText('referral_source', text)).toBeNull()
    }
  })

  it('does nothing on questions with no rules', () => {
    expect(classifyOnboardingOtherText('role', 'instagram')).toBeNull()
  })
})

describe('validateOnboardingSubmission', () => {
  it('accepts a complete submission', () => {
    const result = validateOnboardingSubmission({ answers: fullAnswers() })
    expect(result.ok).toBe(true)
  })

  it('requires every question', () => {
    // The form has no skip, so a partial submission is a stale or hand-rolled
    // client rather than a user choice — and half a response would sit in the
    // analytics looking like a real one.
    const result = validateOnboardingSubmission({
      answers: fullAnswers().slice(0, 2),
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.every((e) => e.questionId !== null)).toBe(true)
  })

  it('rejects an unknown option id', () => {
    // Out-of-date client or a forged post. Accepting it would put a value in
    // the analytics that no question can explain.
    const result = validateOnboardingSubmission({
      answers: fullAnswers([{ questionId: 'role', optionIds: ['ceo_of_mars'] }]),
    })
    expect(result.ok).toBe(false)
  })

  it('rejects multiple answers to a single-choice question', () => {
    const result = validateOnboardingSubmission({
      answers: fullAnswers([
        { questionId: 'role', optionIds: ['student', 'founder'] },
      ]),
    })
    expect(result.ok).toBe(false)
  })

  it('rejects an exclusive option combined with others', () => {
    // "No subscriptions" and "Cursor" cannot both be true; a stored
    // contradiction has no honest reading in the tally.
    const result = validateOnboardingSubmission({
      answers: fullAnswers([
        { questionId: 'subscriptions', optionIds: ['none', 'cursor'] },
      ]),
    })
    expect(result.ok).toBe(false)
  })

  it('accepts the exclusive option on its own', () => {
    const result = validateOnboardingSubmission({
      answers: fullAnswers([
        { questionId: 'subscriptions', optionIds: ['none'] },
      ]),
    })
    expect(result.ok).toBe(true)
  })

  it('accepts multiple answers where the question allows it', () => {
    const result = validateOnboardingSubmission({
      answers: fullAnswers([
        {
          questionId: 'intended_use',
          optionIds: ['work', 'learning', 'automation'],
        },
      ]),
    })
    expect(result.ok).toBe(true)
  })
})

describe('the Other option', () => {
  it('requires accompanying text', () => {
    const result = validateOnboardingSubmission({
      answers: fullAnswers([
        { questionId: 'role', optionIds: [OTHER_OPTION_ID] },
      ]),
    })
    expect(result.ok).toBe(false)
  })

  it('keeps the text when Other is chosen', () => {
    const result = validateOnboardingSubmission({
      answers: fullAnswers([
        {
          questionId: 'role',
          optionIds: [OTHER_OPTION_ID],
          otherText: '  technical writer  ',
        },
      ]),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    const role = result.answers.find((a) => a.questionId === 'role')
    expect(role?.otherText).toBe('technical writer')
  })

  it('drops stray text when Other was NOT chosen', () => {
    // Otherwise text rides along on an answer that has nowhere to display it,
    // and the admin view shows a note against the wrong option.
    const result = validateOnboardingSubmission({
      answers: fullAnswers([
        { questionId: 'role', optionIds: ['student'], otherText: 'ignore me' },
      ]),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.answers.find((a) => a.questionId === 'role')?.otherText).toBeUndefined()
  })

  it('truncates rather than rejecting a long note', () => {
    const result = validateOnboardingSubmission({
      answers: fullAnswers([
        {
          questionId: 'role',
          optionIds: [OTHER_OPTION_ID],
          otherText: 'x'.repeat(ONBOARDING_OTHER_TEXT_MAX + 500),
        },
      ]),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.answers.find((a) => a.questionId === 'role')?.otherText).toHaveLength(
      ONBOARDING_OTHER_TEXT_MAX,
    )
  })
})

describe('isOnboardingComplete — the blocking gate reads this', () => {
  it('is true only when every question has an answer', () => {
    expect(isOnboardingComplete(fullAnswers())).toBe(true)
    expect(isOnboardingComplete(fullAnswers().slice(0, 3))).toBe(false)
  })

  it('treats null, undefined and empty as incomplete', () => {
    // A user with no record must be gated, not waved through — this is the
    // difference between the gate working and being decorative.
    expect(isOnboardingComplete(null)).toBe(false)
    expect(isOnboardingComplete(undefined)).toBe(false)
    expect(isOnboardingComplete([])).toBe(false)
  })

  it('does not count an answer with no options chosen', () => {
    const hollow = fullAnswers([{ questionId: 'role', optionIds: [] }])
    expect(isOnboardingComplete(hollow)).toBe(false)
  })
})
