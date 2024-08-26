import { sortBy } from 'lodash'
import { MultiContract, resolution } from './contract'

export type Answer = {
  id: string
  index: number // Order of the answer in the list
  contractId: string
  userId: string
  text: string
  createdTime: number
  color?: string // Hex color override in UI

  // Mechanism props
  poolYes: number // YES shares
  poolNo: number // NO shares
  prob: number // Computed from poolYes and poolNo.
  totalLiquidity: number // for historical reasons, this the total subsidy amount added in M
  subsidyPool: number // current value of subsidy pool in M

  // Is this 'Other', the answer that represents all other answers, including answers added in the future.
  isOther?: boolean

  resolution?: resolution
  resolutionTime?: number
  resolutionProbability?: number
  resolverId?: string

  probChanges: {
    day: number
    week: number
    month: number
  }

  loverUserId?: string
}

export const MAX_ANSWER_LENGTH = 240

export const MAX_ANSWERS = 100
export const MAX_INDEPENDENT_ANSWERS = 200

export const getMaximumAnswers = (shouldAnswersSumToOne: boolean) =>
  shouldAnswersSumToOne ? MAX_ANSWERS : MAX_INDEPENDENT_ANSWERS

export const OTHER_TOOLTIP_TEXT =
  "Bet on all answers that aren't listed yet. A bet on Other automatically includes any answer added in the future."

export type MultiSort =
  | 'prob-desc'
  | 'prob-asc'
  | 'old'
  | 'new'
  | 'liquidity'
  | 'alphabetical'

export const getDefaultSort = (contract: MultiContract) => {
  const { sort, answers } = contract
  if (sort) return sort
  if (contract.addAnswersMode === 'DISABLED') return 'old'
  else if (!contract.shouldAnswersSumToOne) return 'prob-desc'
  else if (answers.length > 10) return 'prob-desc'
  return 'old'
}

export const sortAnswers = <T extends Answer>(
  contract: MultiContract,
  answers: T[],
  sort?: MultiSort
) => {
  const { resolutions } = contract
  sort = sort ?? getDefaultSort(contract)

  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : true

  return sortBy(answers, [
    shouldAnswersSumToOne
      ? // Winners first
        (answer) => (resolutions ? -1 * resolutions[answer.id] : answer)
      : // Resolved last
        (answer) => (answer.resolution ? 1 : 0),
    // then by sort
    (answer) => {
      if (sort === 'old') {
        return answer.resolutionTime ? answer.resolutionTime : answer.index
      } else if (sort === 'new') {
        return answer.resolutionTime ? -answer.resolutionTime : -answer.index
      } else if (sort === 'prob-asc') {
        return answer.prob
      } else if (sort === 'prob-desc') {
        return -1 * answer.prob
      } else if (sort === 'liquidity') {
        return answer.subsidyPool ? -1 * answer.subsidyPool : 0
      } else if (sort === 'alphabetical') {
        return answer.text.toLowerCase()
      }
      return 0
    },
  ])
}
