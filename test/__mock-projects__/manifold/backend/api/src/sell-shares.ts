import { mapValues, groupBy, sumBy, isEqual } from 'lodash'
import { APIError, type APIHandler } from './helpers/endpoint'
import { CPMM_MIN_POOL_QTY, MarketContract } from 'common/contract'
import { getCpmmMultiSellBetInfo, getCpmmSellBetInfo } from 'common/sell-bet'
import { removeUndefinedProps } from 'common/util/object'
import { floatingEqual, floatingLesserEqual } from 'common/util/math'
import {
  fetchContractBetDataAndValidate,
  getMakerIdsFromBetResult,
  getUserBalances,
  updateMakers,
} from './place-bet'
import { getCpmmProbability } from 'common/calculate-cpmm'
import { onCreateBets } from 'api/on-create-bet'
import { log } from 'shared/utils'
import * as crypto from 'crypto'
import { formatMoneyWithDecimals } from 'common/util/format'
import { incrementBalance } from 'shared/supabase/users'
import { runShortTrans } from 'shared/short-transaction'
import { cancelLimitOrders, insertBet } from 'shared/supabase/bets'
import { convertBet } from 'common/supabase/bets'
import { betsQueue } from 'shared/helpers/fn-queue'
import { FLAT_TRADE_FEE } from 'common/fees'
import { updateAnswers } from 'shared/supabase/answers'
import { updateContract } from 'shared/supabase/contracts'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { Bet, LimitBet } from 'common/bet'
import { Answer } from 'common/answer'

export const sellShares: APIHandler<'market/:contractId/sell'> = async (
  props,
  auth,
  req
) => {
  const userId = auth.uid
  const isApi = auth.creds.kind === 'key'
  const { contractId, shares, outcome, answerId } = props
  const pg = createSupabaseDirectClient()
  const { contract, answers, balanceByUserId, unfilledBets, userBets } =
    await fetchSellSharesDataAndValidate(
      pg,
      contractId,
      answerId,
      userId,
      isApi
    )
  const simulatedResult = calculateSellResult(
    contract,
    answers,
    unfilledBets,
    balanceByUserId,
    answerId,
    outcome,
    shares,
    userBets
  )
  const simulatedMakerIds = getMakerIdsFromBetResult(simulatedResult)
  const deps = [userId, contractId, ...simulatedMakerIds]

  return await betsQueue.enqueueFn(() => sellSharesMain(props, auth, req), deps)
}

const sellSharesMain: APIHandler<'market/:contractId/sell'> = async (
  props,
  auth
) => {
  const { contractId, shares, outcome, answerId } = props
  const userId = auth.uid
  const isApi = auth.creds.kind === 'key'
  const pg = createSupabaseDirectClient()

  const {
    user,
    contract,
    answers,
    balanceByUserId,
    unfilledBets,
    userBets,
    unfilledBetUserIds,
  } = await fetchSellSharesDataAndValidate(
    pg,
    contractId,
    answerId,
    userId,
    isApi
  )
  const simulatedResult = calculateSellResult(
    contract,
    answers,
    unfilledBets,
    balanceByUserId,
    answerId,
    outcome,
    shares,
    userBets
  )
  const simulatedMakerIds = getMakerIdsFromBetResult(simulatedResult)

  const { mechanism, volume } = contract

  const result = await runShortTrans(async (pgTrans) => {
    log(
      `Inside main transaction sellshares for user ${userId} on contract id ${contractId}.`
    )

    // Refetch just user balances in transaction, since queue only enforces contract and bets not changing.
    const balanceByUserId = await getUserBalances(pgTrans, [
      userId,
      ...simulatedMakerIds, // Fetch just the makers that matched in the simulation.
    ])
    user.balance = balanceByUserId[userId]

    for (const userId of unfilledBetUserIds) {
      if (!(userId in balanceByUserId)) {
        // Assume other makers have infinite balance since they are not involved in this bet.
        balanceByUserId[userId] = Number.MAX_SAFE_INTEGER
      }
    }

    const newBetResult = calculateSellResult(
      contract,
      answers,
      unfilledBets,
      balanceByUserId,
      answerId,
      outcome,
      shares,
      userBets
    )
    const {
      newBet,
      newPool,
      newP,
      makers,
      ordersToCancel,
      otherResultsWithBet,
    } = newBetResult

    const actualMakerIds = getMakerIdsFromBetResult(newBetResult)
    log(
      'simulated makerIds',
      simulatedMakerIds,
      'actualMakerIds',
      actualMakerIds
    )
    if (!isEqual(simulatedMakerIds, actualMakerIds)) {
      throw new APIError(
        503,
        'Please try betting again. (Matched limit orders changed from simulated values.)'
      )
    }

    if (
      !newP ||
      !isFinite(newP) ||
      Math.min(...Object.values(newPool ?? {})) < CPMM_MIN_POOL_QTY
    ) {
      throw new APIError(403, 'Sale too large for current liquidity pool.')
    }

    const betGroupId = crypto.randomBytes(12).toString('hex')

    const allOrdersToCancel: LimitBet[] = []
    const fullBets: Bet[] = []
    const answerUpdates: {
      id: string
      poolYes: number
      poolNo: number
      prob: number
    }[] = []

    const apiFee = isApi ? FLAT_TRADE_FEE : 0
    await incrementBalance(pgTrans, user.id, {
      [contract.token === 'CASH' ? 'cashBalance' : 'balance']:
        -newBet.amount + (newBet.loanAmount ?? 0) - apiFee,
    })

    const totalCreatorFee =
      newBet.fees.creatorFee +
      sumBy(otherResultsWithBet, (r) => r.bet.fees.creatorFee)
    if (totalCreatorFee !== 0) {
      await incrementBalance(pgTrans, contract.creatorId, {
        [contract.token === 'CASH' ? 'cashBalance' : 'balance']:
          totalCreatorFee,
      })

      log(
        `Updated creator ${
          contract.creatorUsername
        } with fee gain ${formatMoneyWithDecimals(totalCreatorFee)} - ${
          contract.creatorId
        }.`
      )
    }

    const candidateBet = {
      userId: user.id,
      isApi,
      ...newBet,
      betGroupId,
    }
    const betRow = await insertBet(candidateBet, pgTrans)
    fullBets.push(convertBet(betRow))

    await updateMakers(makers, betRow.bet_id, contract, pgTrans)

    allOrdersToCancel.push(...ordersToCancel)

    if (mechanism === 'cpmm-1') {
      await updateContract(
        pgTrans,
        contractId,
        removeUndefinedProps({
          pool: newPool,
          p: newP,
          volume: volume + Math.abs(newBet.amount),
          prob: newPool && newP ? getCpmmProbability(newPool, newP) : undefined,
        })
      )
    } else if (newBet.answerId) {
      const prob = getCpmmProbability(newPool, 0.5)
      const { YES: poolYes, NO: poolNo } = newPool

      answerUpdates.push({
        id: newBet.answerId,
        poolYes,
        poolNo,
        prob,
      })
    }

    for (const {
      answer,
      bet,
      cpmmState,
      makers,
      ordersToCancel,
    } of otherResultsWithBet) {
      const candidateBet = {
        userId: user.id,
        isApi,
        ...bet,
        betGroupId,
      }
      const betRow = await insertBet(candidateBet, pgTrans)
      fullBets.push(convertBet(betRow))

      await updateMakers(makers, betRow.bet_id, contract, pgTrans)

      const { YES: poolYes, NO: poolNo } = cpmmState.pool
      const prob = getCpmmProbability(cpmmState.pool, 0.5)
      answerUpdates.push({
        id: answer.id,
        poolYes,
        poolNo,
        prob,
      })

      allOrdersToCancel.push(...ordersToCancel)
    }

    await updateAnswers(pgTrans, contract.id, answerUpdates)
    await cancelLimitOrders(
      pgTrans,
      allOrdersToCancel.map((o) => o.id)
    )

    return {
      newBet,
      user,
      fullBets,
      betId: betRow.bet_id,
      makers,
      contract,
      otherResultsWithBet,
      allOrdersToCancel,
    }
  })

  const {
    newBet,
    betId,
    makers,
    otherResultsWithBet,
    fullBets,
    allOrdersToCancel,
  } = result

  const continuation = async () => {
    await onCreateBets(
      fullBets,
      contract as MarketContract,
      user,
      allOrdersToCancel,
      [...makers, ...otherResultsWithBet.flatMap((r) => r.makers)]
    )
  }
  return { result: { ...newBet, betId }, continue: continuation }
}

const fetchSellSharesDataAndValidate = async (
  pgTrans: SupabaseTransaction | SupabaseDirectClient,
  contractId: string,
  answerId: string | undefined,
  userId: string,
  isApi: boolean
) => {
  const userBetsPromise = pgTrans.map(
    `select * from contract_bets where user_id = $1
        and contract_id = $2
        ${answerId ? 'and answer_id = $3' : ''}`,
    [userId, contractId, answerId],
    convertBet
  )
  const {
    user,
    contract,
    answers,
    balanceByUserId,
    unfilledBets,
    unfilledBetUserIds,
  } = await fetchContractBetDataAndValidate(
    pgTrans,
    {
      contractId,
      amount: undefined,
      answerId,
    },
    userId,
    isApi
  )
  const userBets = await userBetsPromise

  const { mechanism } = contract

  if (mechanism !== 'cpmm-1' && mechanism !== 'cpmm-multi-1')
    throw new APIError(
      403,
      'You can only sell shares on cpmm-1 or cpmm-multi-1 contracts'
    )

  return {
    user,
    contract,
    answers,
    balanceByUserId,
    unfilledBets,
    unfilledBetUserIds,
    userBets,
  }
}

const calculateSellResult = (
  contract: MarketContract,
  answers: Answer[] | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: Record<string, number>,
  answerId: string | undefined,
  outcome: 'YES' | 'NO' | undefined,
  shares: number | undefined,
  userBets: Bet[]
) => {
  const { mechanism } = contract

  const loanAmount = sumBy(userBets, (bet) => bet.loanAmount ?? 0)
  const betsByOutcome = groupBy(userBets, (bet) => bet.outcome)
  const sharesByOutcome = mapValues(betsByOutcome, (bets) =>
    sumBy(bets, (b) => b.shares)
  )

  let chosenOutcome: 'YES' | 'NO'
  if (outcome != null) {
    chosenOutcome = outcome
  } else {
    const nonzeroShares = Object.entries(sharesByOutcome).filter(
      ([_k, v]) => !floatingEqual(0, v)
    )
    if (nonzeroShares.length == 0) {
      throw new APIError(403, "You don't own any shares in this market.")
    }
    if (nonzeroShares.length > 1) {
      throw new APIError(
        400,
        `You own multiple kinds of shares, but did not specify which to sell.`
      )
    }
    chosenOutcome = nonzeroShares[0][0] as 'YES' | 'NO'
  }

  const maxShares = sharesByOutcome[chosenOutcome]
  const sharesToSell = shares ?? maxShares

  if (!maxShares)
    throw new APIError(
      403,
      `You don't have any ${chosenOutcome} shares to sell.`
    )

  if (!floatingLesserEqual(sharesToSell, maxShares))
    throw new APIError(400, `You can only sell up to ${maxShares} shares.`)

  const soldShares = Math.min(sharesToSell, maxShares)
  const saleFrac = soldShares / maxShares
  let loanPaid = saleFrac * loanAmount
  if (!isFinite(loanPaid)) loanPaid = 0

  let answer
  if (
    mechanism === 'cpmm-1' ||
    (mechanism === 'cpmm-multi-1' && !contract.shouldAnswersSumToOne)
  ) {
    if (answerId) {
      answer = answers?.find((a) => a.id === answerId)
      if (!answer) {
        throw new APIError(400, 'Could not find answer ' + answerId)
      }
      if (answer.resolution) {
        throw new APIError(403, 'Answer is resolved and cannot be bet on')
      }
    }
    return {
      otherResultsWithBet: [],
      ...getCpmmSellBetInfo(
        soldShares,
        chosenOutcome,
        contract,
        unfilledBets,
        balanceByUserId,
        loanPaid,
        answer
      ),
    }
  } else {
    if (!answers) throw new APIError(404, 'Should have fetched answers...')

    const answer = answers.find((a) => a.id === answerId)
    if (!answer) throw new APIError(404, 'Answer not found')
    if (answers.length < 2)
      throw new APIError(
        403,
        'Cannot bet until at least two answers are added.'
      )

    return {
      newP: 0.5,
      ...getCpmmMultiSellBetInfo(
        contract,
        answers,
        answer,
        soldShares,
        chosenOutcome,
        undefined,
        unfilledBets,
        balanceByUserId,
        loanPaid
      ),
    }
  }
}
