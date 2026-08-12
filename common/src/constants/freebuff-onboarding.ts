/**
 * The post-signup onboarding questionnaire.
 *
 * Four questions, each a fixed option list plus a free-text "Other". Shared
 * between the form, the persistence layer and the admin view so a renamed
 * option cannot silently split one answer into two in the analytics.
 *
 * Why the option ids are opaque and permanent
 * -------------------------------------------
 * The stored value is the id, never the label. Labels are copy and will be
 * reworded; ids are data. Changing a label is free, changing an id
 * retroactively rewrites history — so ids here are append-only. Retire an
 * option by removing it from the list, never by renaming it.
 */

export type OnboardingQuestionId =
  | 'referral_source'
  | 'role'
  | 'proficiency'
  | 'intended_use'

export type OnboardingOption = {
  /** Stored verbatim. Append-only — see the note above. */
  id: string
  label: string
}

export type OnboardingQuestion = {
  id: OnboardingQuestionId
  prompt: string
  /** Shown under the prompt when the question needs framing. */
  hint?: string
  options: OnboardingOption[]
  /** Whether more than one option may be chosen. */
  multi: boolean
}

/** Every question offers this. The accompanying free text is stored separately
 *  so "other" stays countable while the text stays readable. */
export const OTHER_OPTION_ID = 'other'

export const FREEBUFF_ONBOARDING_QUESTIONS: readonly OnboardingQuestion[] = [
  {
    id: 'referral_source',
    prompt: 'Where did you hear about Freebuff?',
    // Attribution is the one answer we cannot reconstruct later: referrer
    // headers are stripped, and self-report is the only signal for word of
    // mouth, which is where most of it actually comes from.
    options: [
      { id: 'youtube', label: 'YouTube' },
      { id: 'x_twitter', label: 'X / Twitter' },
      { id: 'reddit', label: 'Reddit' },
      { id: 'tiktok', label: 'TikTok' },
      { id: 'discord', label: 'Discord' },
      { id: 'github', label: 'GitHub' },
      { id: 'search', label: 'Google / search' },
      { id: 'friend', label: 'A friend or colleague' },
      { id: 'blog_news', label: 'Blog or newsletter' },
      { id: OTHER_OPTION_ID, label: 'Somewhere else' },
    ],
    multi: false,
  },
  {
    id: 'role',
    prompt: 'What best describes you?',
    options: [
      { id: 'professional_dev', label: 'Professional developer' },
      { id: 'student', label: 'Student' },
      { id: 'hobbyist', label: 'Hobbyist / side projects' },
      { id: 'founder', label: 'Founder or indie hacker' },
      { id: 'designer', label: 'Designer' },
      { id: 'pm', label: 'Product or project manager' },
      { id: 'data_ml', label: 'Data / ML' },
      { id: 'non_technical', label: 'Non-technical' },
      { id: OTHER_OPTION_ID, label: 'Something else' },
    ],
    multi: false,
  },
  {
    id: 'proficiency',
    prompt: 'How would you describe your coding experience?',
    options: [
      { id: 'none', label: "I don't code" },
      { id: 'beginner', label: 'Beginner — learning the basics' },
      { id: 'intermediate', label: 'Intermediate — I build things' },
      { id: 'advanced', label: 'Advanced — years of experience' },
      { id: 'expert', label: 'Expert — I do this professionally at depth' },
    ],
    // No Other: this is an ordered scale, and a free-text answer on an ordinal
    // question is unusable for the segmentation it exists to support.
    multi: false,
  },
  {
    id: 'intended_use',
    prompt: 'What do you want to use Freebuff for?',
    hint: 'Pick as many as apply.',
    options: [
      { id: 'side_projects', label: 'Personal or side projects' },
      { id: 'work', label: 'Work / production code' },
      { id: 'learning', label: 'Learning to code' },
      { id: 'prototyping', label: 'Prototyping and demos' },
      { id: 'automation', label: 'Scripts and automation' },
      { id: 'debugging', label: 'Debugging and code review' },
      { id: 'website', label: 'Building a website or app' },
      { id: OTHER_OPTION_ID, label: 'Something else' },
    ],
    multi: true,
  },
] as const

export type OnboardingAnswer = {
  questionId: OnboardingQuestionId
  /** Chosen option ids. Single-choice questions carry exactly one. */
  optionIds: string[]
  /** Free text, only when `other` is among the chosen ids. */
  otherText?: string
}

export type OnboardingSubmission = {
  answers: OnboardingAnswer[]
}

export const ONBOARDING_OTHER_TEXT_MAX = 200

export type OnboardingValidationError = {
  questionId: OnboardingQuestionId
  message: string
}

/**
 * Validate a submission against the question set.
 *
 * Deliberately strict about ids and lenient about text: an unknown option id
 * means the client is out of date or forged, and accepting it would put a value
 * in the analytics that no question can explain. Free text is merely trimmed
 * and truncated — it is never interpreted, only displayed.
 */
export function validateOnboardingSubmission(
  submission: OnboardingSubmission,
  questions: readonly OnboardingQuestion[] = FREEBUFF_ONBOARDING_QUESTIONS,
): { ok: true; answers: OnboardingAnswer[] } | { ok: false; errors: OnboardingValidationError[] } {
  const errors: OnboardingValidationError[] = []
  const cleaned: OnboardingAnswer[] = []

  for (const question of questions) {
    const answer = submission.answers.find((a) => a.questionId === question.id)
    const optionIds = answer?.optionIds ?? []

    if (optionIds.length === 0) {
      errors.push({ questionId: question.id, message: 'Please choose an option.' })
      continue
    }
    if (!question.multi && optionIds.length > 1) {
      errors.push({ questionId: question.id, message: 'Choose one option.' })
      continue
    }

    const valid = new Set(question.options.map((o) => o.id))
    const unknown = optionIds.filter((id) => !valid.has(id))
    if (unknown.length > 0) {
      errors.push({ questionId: question.id, message: 'Unrecognised option.' })
      continue
    }

    const wantsOther = optionIds.includes(OTHER_OPTION_ID)
    const otherText = answer?.otherText?.trim()
    if (wantsOther && !otherText) {
      errors.push({
        questionId: question.id,
        message: 'Tell us a little more.',
      })
      continue
    }

    cleaned.push({
      questionId: question.id,
      optionIds,
      // Dropped unless `other` was chosen, so stray text cannot ride along on
      // an answer that has nowhere to show it.
      ...(wantsOther && otherText
        ? { otherText: otherText.slice(0, ONBOARDING_OTHER_TEXT_MAX) }
        : {}),
    })
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, answers: cleaned }
}

/** Every question answered — the completion test the blocking gate uses. */
export function isOnboardingComplete(
  answers: readonly OnboardingAnswer[] | null | undefined,
  questions: readonly OnboardingQuestion[] = FREEBUFF_ONBOARDING_QUESTIONS,
): boolean {
  if (!answers || answers.length === 0) return false
  const answered = new Set(
    answers.filter((a) => a.optionIds.length > 0).map((a) => a.questionId),
  )
  return questions.every((q) => answered.has(q.id))
}
