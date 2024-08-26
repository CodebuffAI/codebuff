import { keyBy, sumBy } from 'lodash'
import { LoverRow } from 'common/love/lover'
import { Row as rowFor } from 'common/supabase/utils'
import {
  areAgeCompatible,
  areLocationCompatible,
  areRelationshipStyleCompatible,
  areWantKidsCompatible,
} from './compatibility-util'

const importanceToScore = {
  0: 0,
  1: 1,
  2: 5,
  3: 25,
} as { [importance: string]: number }

export type CompatibilityScore = {
  score: number
  confidence: 'low' | 'medium' | 'high'
}

export const getCompatibilityScore = (
  answers1: rowFor<'love_compatibility_answers'>[],
  answers2: rowFor<'love_compatibility_answers'>[]
): CompatibilityScore => {
  const {
    score: score1,
    maxScore: maxScore1,
    answerCount,
  } = getAnswersCompatibility(answers1, answers2)
  const { score: score2, maxScore: maxScore2 } = getAnswersCompatibility(
    answers2,
    answers1
  )

  // >=100 answers in common leads to no weight toward 50%.
  // Use sqrt for diminishing returns to answering more questions.
  const weightTowardFiftyPercent = Math.max(
    25 - 2.5 * Math.sqrt(answerCount),
    0
  )
  const upWeight = weightTowardFiftyPercent / 2
  const downWeight = weightTowardFiftyPercent
  const compat1 = (score1 + upWeight) / (maxScore1 + downWeight)
  const compat2 = (score2 + upWeight) / (maxScore2 + downWeight)
  const geometricMean = Math.sqrt(compat1 * compat2)

  const confidence =
    answerCount < 10 ? 'low' : answerCount < 100 ? 'medium' : 'high'

  return { score: geometricMean, confidence }
}

const getAnswersCompatibility = (
  answers1: rowFor<'love_compatibility_answers'>[],
  answers2: rowFor<'love_compatibility_answers'>[]
) => {
  const answers2ByQuestionId = keyBy(answers2, 'question_id')
  let maxScore = 0
  let answerCount = 0

  const score = sumBy(answers1, (a) => {
    if (a.importance === -1) return 0

    const answer2 = answers2ByQuestionId[a.question_id]
    // Not answered or skipped.
    if (!answer2 || answer2.importance === -1) return 0

    answerCount++
    const importanceScore = importanceToScore[a.importance] ?? 0
    maxScore += importanceScore
    return getAnswerCompatibilityImportanceScore(a, answer2)
  })

  return { score, maxScore, answerCount }
}

export function getAnswerCompatibilityImportanceScore(
  answer1: rowFor<'love_compatibility_answers'>,
  answer2: rowFor<'love_compatibility_answers'>
) {
  const importanceScore = importanceToScore[answer1.importance] ?? 0
  return answer1.pref_choices.includes(answer2.multiple_choice)
    ? importanceScore
    : 0
}

export function getAnswerCompatibility(
  answer1: rowFor<'love_compatibility_answers'>,
  answer2: rowFor<'love_compatibility_answers'>
) {
  if (answer1.importance < 0 || answer2.importance < 0) {
    return false
  }

  const compatibility1to2 = answer1.pref_choices.includes(
    answer2.multiple_choice
  )
  const compatibility2to1 = answer2.pref_choices.includes(
    answer1.multiple_choice
  )

  return compatibility1to2 && compatibility2to1
}

export function getScoredAnswerCompatibility(
  answer1: rowFor<'love_compatibility_answers'>,
  answer2: rowFor<'love_compatibility_answers'>
) {
  if (answer1.importance < 0 || answer2.importance < 0) {
    return 0
  }

  const compatibility1to2 = +answer1.pref_choices.includes(
    answer2.multiple_choice
  )
  const compatibility2to1 = +answer2.pref_choices.includes(
    answer1.multiple_choice
  )
  const importanceCompatibility =
    1 - Math.abs(answer1.importance - answer2.importance) / 4

  // Adjust these weights to change the impact of each component
  const compatibilityWeight = 0.7
  const importanceWeight = 0.3

  return (
    ((compatibility1to2 + compatibility2to1) * compatibilityWeight +
      importanceCompatibility * importanceWeight) /
    2
  )
}

export const getLoversCompatibilityFactor = (
  lover1: LoverRow,
  lover2: LoverRow
) => {
  let multiplier = 1
  multiplier *= areAgeCompatible(lover1, lover2) ? 1 : 0.5
  multiplier *= areRelationshipStyleCompatible(lover1, lover2) ? 1 : 0.5
  multiplier *= areWantKidsCompatible(lover1, lover2) ? 1 : 0.5
  multiplier *= areLocationCompatible(lover1, lover2) ? 1 : 0.1
  return multiplier
}
