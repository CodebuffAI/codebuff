import { JSONContent } from '@tiptap/core'
import { getDisplayProbability } from 'common/calculate'
import { Topic } from 'common/group'
import { ChartAnnotation } from 'common/supabase/chart-annotations'
import { sum } from 'lodash'
import { Answer } from './answer'
import { Bet } from './bet'
import { getLiquidity } from './calculate-cpmm'
import { ContractComment } from './comment'
import { ContractMetric, ContractMetricsByOutcome } from './contract-metric'
import { ENV_CONFIG, isAdminId, isModId } from './envs/constants'
import { Fees } from './fees'
import { PollOption } from './poll-option'
import { formatMoney, formatPercent } from './util/format'
import { MINUTE_MS } from './util/time'
import { MarketTierType } from './tier'

/************************************************

supabase status: columns exist for
  slug: text
  creatorId: text
  question: text
  visibility: text
  mechanism: text
  outcomeType: text
  createdTime: timestamp (from millis)
  closeTime?: timestamp (from millis)
  resolutionTime?: timestamp (from millis)
  resolution?: text
  resolutionProbability?: numeric
  popularityScore: numeric
  importanceScore: numeric

any changes to the type of these columns in firestore will require modifying
the supabase trigger, or replication of contracts may fail!

*************************************************/

type AnyContractType =
  | (CPMM & Binary)
  | (CPMM & PseudoNumeric)
  | QuadraticFunding
  | (CPMM & Stonk)
  | CPMMMulti
  | (NonBet & BountiedQuestion)
  | (NonBet & Poll)
  | CPMMMultiNumeric

export type Contract<T extends AnyContractType = AnyContractType> = {
  id: string
  slug: string // auto-generated; must be unique

  creatorId: string
  creatorName: string
  creatorUsername: string
  creatorAvatarUrl?: string
  creatorCreatedTime?: number

  question: string
  description: string | JSONContent // More info about what the contract is about
  visibility: Visibility

  createdTime: number // Milliseconds since epoch
  lastUpdatedTime: number // Updated on any change to the market (metadata, bet, comment)
  lastBetTime?: number
  lastCommentTime?: number
  closeTime?: number // When no more trading is allowed
  deleted?: boolean // If true, don't show market anywhere.

  isResolved: boolean
  resolutionTime?: number // When the contract creator resolved the market
  resolution?: string
  resolutionProbability?: number
  resolverId?: string
  isSpicePayout?: boolean

  closeEmailsSent?: number

  volume: number
  volume24Hours: number
  elasticity: number

  collectedFees: Fees
  uniqueBettorCount: number
  uniqueBettorCountDay: number

  unlistedById?: string
  featuredLabel?: string
  isTwitchContract?: boolean

  coverImageUrl?: string
  isRanked?: boolean

  gptCommentSummary?: string

  marketTier?: MarketTierType

  token: 'MANA' | 'CASH'
  siblingContractId?: string

  // Manifold.love
  loverUserId1?: string // The user id's of the pair of lovers referenced in the question.
  loverUserId2?: string // The user id's of the pair of lovers referenced in the question.
  matchCreatorId?: string // The user id of the person who proposed the match.
  isLove?: boolean

  /** @deprecated - no more auto-subsidization */
  isSubsidized?: boolean // NOTE: not backfilled, undefined = true
  /** @deprecated - try to use group-contracts table instead */
  groupSlugs?: string[]
  /** @deprecated - not deprecated, only updated in native column though*/
  popularityScore: number
  /** @deprecated - not deprecated, only updated in native column though*/
  importanceScore: number
  /** @deprecated - not deprecated, only updated in native column though*/
  dailyScore: number
  /** @deprecated - not deprecated, only updated in native column though*/
  freshnessScore: number
  /** @deprecated - not deprecated, only updated in native column though*/
  conversionScore: number
  /** @deprecated - not deprecated, only updated in native column though*/
  viewCount: number
  /** @deprecated - not up-to-date */
  likedByUserCount?: number
} & T

export type CPMMContract = Contract & CPMM
export type CPMMMultiContract = Contract & CPMMMulti
export type CPMMNumericContract = Contract & CPMMMultiNumeric
export type MarketContract =
  | CPMMContract
  | CPMMMultiContract
  | CPMMNumericContract

export type BinaryContract = Contract & Binary
export type PseudoNumericContract = Contract & PseudoNumeric
export type QuadraticFundingContract = Contract & QuadraticFunding
export type StonkContract = Contract & Stonk
export type BountiedQuestionContract = Contract & BountiedQuestion
export type PollContract = Contract & Poll

export type BinaryOrPseudoNumericContract =
  | BinaryContract
  | PseudoNumericContract
  | StonkContract

export type CPMM = {
  mechanism: 'cpmm-1'
  pool: { [outcome: string]: number }
  p: number // probability constant in y^p * n^(1-p) = k
  totalLiquidity: number // for historical reasons, this the total subsidy amount added in Ṁ
  subsidyPool: number // current value of subsidy pool in Ṁ
  prob: number
  probChanges: {
    day: number
    week: number
    month: number
  }
}

export type NonBet = {
  mechanism: 'none'
}

export const NON_BETTING_OUTCOMES: OutcomeType[] = ['BOUNTIED_QUESTION', 'POLL']
export const NO_CLOSE_TIME_TYPES: OutcomeType[] = NON_BETTING_OUTCOMES.concat([
  'STONK',
])

/**
 * Implemented as a set of cpmm-1 binary contracts, one for each answer.
 * The mechanism is stored among the contract's answers, which each
 * reference this contract id.
 */
export type CPMMMulti = {
  mechanism: 'cpmm-multi-1'
  outcomeType: 'MULTIPLE_CHOICE'
  shouldAnswersSumToOne: boolean
  addAnswersMode?: add_answers_mode

  totalLiquidity: number // for historical reasons, this the total subsidy amount added in Ṁ
  subsidyPool: number // current value of subsidy pool in Ṁ
  specialLiquidityPerAnswer?: number // Special liquidity mode, where initial ante is copied into each answer's pool, with a min probability, and only one answer can resolve YES. shouldAnswersSumToOne must be false.

  // Answers chosen on resolution, with the weights of each answer.
  // Weights sum to 100 if shouldAnswersSumToOne is true. Otherwise, range from 0 to 100 for each answerId.
  resolutions?: { [answerId: string]: number }

  // NOTE: This field is stored in the answers table and must be denormalized to the client.
  answers: Answer[]
  sort?: SortType
}

export type CPMMMultiNumeric = {
  mechanism: 'cpmm-multi-1'
  outcomeType: 'NUMBER'
  shouldAnswersSumToOne: true
  addAnswersMode: 'DISABLED'
  max: number
  min: number

  totalLiquidity: number // for historical reasons, this the total subsidy amount added in Ṁ
  subsidyPool: number // current value of subsidy pool in Ṁ

  // Answers chosen on resolution, with the weights of each answer.
  // Weights sum to 100 if shouldAnswersSumToOne is true. Otherwise, range from 0 to 100 for each answerId.
  resolutions?: { [answerId: string]: number }

  // NOTE: This field is stored in the answers table and must be denormalized to the client.
  answers: Answer[]
  sort?: SortType
}

export type add_answers_mode = 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE'

export type QuadraticFunding = {
  outcomeType: 'QUADRATIC_FUNDING'
  mechanism: 'qf'
  answers: any[]
  // Mapping of how much each user has contributed to the matching pool
  // Note: Our codebase assumes every contract has a pool, which is why this isn't just a constant
  pool: { M$: number }

  // Used when the funding round pays out
  resolution?: 'MKT' | 'CANCEL'
  resolutions?: { [outcome: string]: number } // Used for MKT resolution.
}

export type Binary = {
  outcomeType: 'BINARY'
  initialProbability: number
  resolutionProbability?: number // Used for BINARY markets resolved to MKT
  resolution?: resolution
}

export type PseudoNumeric = {
  outcomeType: 'PSEUDO_NUMERIC'
  min: number
  max: number
  isLogScale: boolean
  resolutionValue?: number

  // same as binary market; map everything to probability
  initialProbability: number
  resolutionProbability?: number
}

export type MultipleNumeric = {
  outcomeType: 'NUMBER'
  answers: Answer[]
  min: number
  max: number
  resolution?: string | 'MKT' | 'CANCEL'
  resolutions?: { [outcome: string]: number } // Used for MKT resolution.
}

export type Stonk = {
  outcomeType: 'STONK'
  initialProbability: number
}

export type BountiedQuestion = {
  outcomeType: 'BOUNTIED_QUESTION'
  totalBounty: number
  bountyLeft: number
  /** @deprecated */
  bountyTxns?: string[]

  // Special mode where bounty pays out automatically in proportion to likes over 48 hours.
  isAutoBounty?: boolean
}

export type Poll = {
  outcomeType: 'POLL'
  options: PollOption[]
  resolutions?: string[]
}

export type MultiContract = CPMMMultiContract | CPMMNumericContract

type AnyOutcomeType =
  | Binary
  | QuadraticFunding
  | Stonk
  | BountiedQuestion
  | Poll
  | MultipleNumeric
  | CPMMMulti
  | PseudoNumeric

export type OutcomeType = AnyOutcomeType['outcomeType']
export type resolution = 'YES' | 'NO' | 'MKT' | 'CANCEL'
export const RESOLUTIONS = ['YES', 'NO', 'MKT', 'CANCEL'] as const
export const CREATEABLE_OUTCOME_TYPES = [
  'BINARY',
  'MULTIPLE_CHOICE',
  'PSEUDO_NUMERIC',
  'STONK',
  'BOUNTIED_QUESTION',
  'POLL',
  'NUMBER',
] as const

export const CREATEABLE_NON_PREDICTIVE_OUTCOME_TYPES = [
  'POLL',
  'BOUNTIED_QUESTION',
]

export type CreateableOutcomeType = (typeof CREATEABLE_OUTCOME_TYPES)[number]

export const renderResolution = (resolution: string, prob?: number) => {
  return (
    {
      YES: 'YES',
      NO: 'NO',
      CANCEL: 'N/A',
      MKT: formatPercent(prob ?? 0),
    }[resolution] || resolution
  )
}

export function contractPathWithoutContract(
  creatorUsername: string,
  slug: string
) {
  return `/${creatorUsername}/${slug}`
}

export function contractUrl(contract: Contract) {
  return `https://${ENV_CONFIG.domain}${contractPath(contract)}`
}

export function contractPool(contract: Contract) {
  return contract.mechanism === 'cpmm-1'
    ? formatMoney(contract.totalLiquidity)
    : contract.mechanism === 'cpmm-multi-1'
    ? formatMoney(
        sum(
          contract.answers.map((a) =>
            getLiquidity({ YES: a.poolYes, NO: a.poolNo })
          )
        )
      )
    : 'Empty pool'
}

export const isBinaryMulti = (contract: Contract) =>
  contract.mechanism === 'cpmm-multi-1' &&
  contract.outcomeType !== 'NUMBER' &&
  contract.answers.length === 2 &&
  contract.addAnswersMode === 'DISABLED' &&
  contract.shouldAnswersSumToOne
// contract.createdTime > 1708574059795 // In case we don't want to convert pre-commit contracts

export const getMainBinaryMCAnswer = (contract: Contract) =>
  isBinaryMulti(contract) && contract.mechanism === 'cpmm-multi-1'
    ? contract.answers[0]
    : undefined

export const getBinaryMCProb = (prob: number, outcome: 'YES' | 'NO' | string) =>
  outcome === 'YES' ? prob : 1 - prob

export function getBinaryProbPercent(contract: BinaryContract) {
  return formatPercent(getDisplayProbability(contract))
}

export function tradingAllowed(contract: Contract, answer?: Answer) {
  return (
    !contract.isResolved &&
    (!contract.closeTime || contract.closeTime > Date.now()) &&
    contract.mechanism !== 'none' &&
    (!answer || !answer.resolution)
  )
}

export const MAX_QUESTION_LENGTH = 120
export const MAX_DESCRIPTION_LENGTH = 16000

export const CPMM_MIN_POOL_QTY = 0.01
export const MULTI_NUMERIC_BUCKETS_MAX = 50
export const MULTI_NUMERIC_CREATION_ENABLED = true

export type Visibility = 'public' | 'unlisted'
export const VISIBILITIES = ['public' /*, 'unlisted'*/] as const

export const SORTS = [
  { label: 'High %', value: 'prob-desc' },
  { label: 'Low %', value: 'prob-asc' },
  { label: 'Oldest', value: 'old' },
  { label: 'Newest', value: 'new' },
  { label: 'Trending', value: 'liquidity' },
  { label: 'A-Z', value: 'alphabetical' },
] as const

export type SortType = (typeof SORTS)[number]['value']

export const MINUTES_ALLOWED_TO_UNRESOLVE = 10

export function contractPath(contract: {
  creatorUsername: string
  slug: string
}) {
  return `/${contract.creatorUsername}/${contract.slug}`
}

export type ContractParams = {
  contract: Contract
  lastBetTime?: number
  pointsString?: string
  multiPointsString?: { [answerId: string]: string }
  comments: ContractComment[]
  userPositionsByOutcome: ContractMetricsByOutcome
  totalPositions: number
  totalBets: number
  topContractMetrics: ContractMetric[]
  relatedContracts: Contract[]
  chartAnnotations: ChartAnnotation[]
  topics: Topic[]
  dashboards: { slug: string; title: string }[]
  pinnedComments: ContractComment[]
  betReplies: Bet[]
  cash?: {
    contract: Contract
    pointsString: string
    multiPointsString: { [answerId: string]: string }
    userPositionsByOutcome: ContractMetricsByOutcome
    totalPositions: number
    totalBets: number
  }
}

export type MaybeAuthedContractParams =
  | {
      state: 'authed'
      params: ContractParams
    }
  | {
      state: 'deleted'
    }

export const MAX_CPMM_PROB = 0.99
export const MIN_CPMM_PROB = 0.01
export const MAX_STONK_PROB = 0.95
export const MIN_STONK_PROB = 0.2

export const canCancelContract = (userId: string, contract: Contract) => {
  const createdRecently = (Date.now() - contract.createdTime) / MINUTE_MS < 15
  return createdRecently || isModId(userId) || isAdminId(userId)
}

export const isMarketRanked = (contract: Contract) =>
  contract.isRanked != false &&
  contract.visibility === 'public' &&
  contract.deleted !== true

export const PROFIT_CUTOFF_TIME = 1715805887741
export const DPM_CUTOFF_TIMESTAMP = '2023-08-01 18:06:58.813000 +00:00'
export const getAdjustedProfit = (
  contract: Contract,
  profit: number,
  answers: Answer[] | undefined,
  answerId: string | null
) => {
  if (contract.mechanism === 'cpmm-multi-1') {
    // Null answerId stands for the summary of all answer metrics
    if (!answerId) {
      return isMarketRanked(contract) &&
        contract.resolutionTime &&
        contract.resolutionTime <= PROFIT_CUTOFF_TIME &&
        contract.createdTime > Date.parse(DPM_CUTOFF_TIMESTAMP)
        ? 9 * profit
        : isMarketRanked(contract)
        ? undefined
        : -1 * profit
    }
    const answer = answers?.find((a) => a.id === answerId)
    if (!answer) {
      console.log(
        `answer with id ${answerId} not found, but is required for cpmm-multi-1 contract: ${contract.id}`
      )
      return undefined
    }
    return isMarketRanked(contract) &&
      answer.resolutionTime &&
      answer.resolutionTime <= PROFIT_CUTOFF_TIME &&
      contract.createdTime > Date.parse(DPM_CUTOFF_TIMESTAMP)
      ? 9 * profit
      : isMarketRanked(contract)
      ? undefined
      : -1 * profit
  }

  return isMarketRanked(contract) &&
    contract.resolutionTime &&
    contract.resolutionTime <= PROFIT_CUTOFF_TIME
    ? 9 * profit
    : isMarketRanked(contract)
    ? undefined
    : -1 * profit
}
