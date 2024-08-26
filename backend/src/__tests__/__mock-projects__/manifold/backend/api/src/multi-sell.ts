import * as crypto from 'crypto'
import { APIError, type APIHandler } from './helpers/endpoint'
import { onCreateBets } from 'api/on-create-bet'
import {
  getUnfilledBetsAndUserBalances,
  executeNewBetResult,
} from 'api/place-bet'
import { getContract, getUser, log } from 'shared/utils'
import { groupBy, mapValues, sum, sumBy } from 'lodash'
import { getCpmmMultiSellSharesInfo } from 'common/sell-bet'
import { incrementBalance } from 'shared/supabase/users'
import { runShortTrans } from 'shared/short-transaction'
import { convertBet } from 'common/supabase/bets'
import { betsQueue } from 'shared/helpers/fn-queue'
import { getAnswersForContract } from 'shared/supabase/answers'

export const multiSell: APIHandler<'multi-sell'> = async (props, auth, req) => {
  return await betsQueue.enqueueFn(
    () => multiSellMain(props, auth, req),
    [props.contractId, auth.uid]
  )
}

const multiSellMain: APIHandler<'multi-sell'> = async (props, auth) => {
  const { contractId, answerIds, deterministic } = props
  const { uid } = auth
  const isApi = auth.creds.kind === 'key'

  const user = await getUser(uid)
  if (!user) throw new APIError(401, 'Your account was not found')

  const { bets, contract } = await runShortTrans(async (pgTrans) => {
    const contract = await getContract(pgTrans, contractId)
    if (!contract) throw new APIError(404, 'Contract not found')
    const { closeTime, isResolved, mechanism } = contract
    if (closeTime && Date.now() > closeTime)
      throw new APIError(403, 'Trading is closed.')
    if (isResolved) throw new APIError(403, 'Market is resolved.')
    if (mechanism != 'cpmm-multi-1' || !('shouldAnswersSumToOne' in contract))
      throw new APIError(400, 'Contract type/mechanism not supported')

    log(
      `Checking for limit orders and bets in sellshares for user ${uid} on contract id ${contractId}.`
    )

    const answers = await getAnswersForContract(pgTrans, contractId)
    const answersToSell = answers.filter((a) => answerIds.includes(a.id))
    if (!answersToSell) throw new APIError(404, 'Answers not found')

    const unfilledBetsAndBalances = await Promise.all(
      answersToSell.map((answer) =>
        getUnfilledBetsAndUserBalances(pgTrans, contractId, answer.id)
      )
    )
    const unfilledBets = unfilledBetsAndBalances.flatMap((b) => b.unfilledBets)
    let balancesByUserId: Record<string, number> = {}
    unfilledBetsAndBalances.forEach((b) => {
      balancesByUserId = { ...balancesByUserId, ...b.balanceByUserId }
    })

    const userBets = await pgTrans.map(
      `select * from contract_bets where user_id = $1 and answer_id in ($2:list)`,
      [uid, answersToSell.map((a) => a.id)],
      convertBet
    )

    const loanAmountByAnswerId = mapValues(
      groupBy(userBets, 'answerId'),
      (bets) => sumBy(bets, (bet) => bet.loanAmount ?? 0)
    )
    const nonRedemptionBetsByAnswerId = groupBy(
      userBets.filter((bet) => bet.shares !== 0),
      (bet) => bet.answerId
    )
    const sharesByAnswerId = mapValues(nonRedemptionBetsByAnswerId, (bets) =>
      sumBy(bets, (b) => b.shares)
    )
    const minShares = Math.min(...Object.values(sharesByAnswerId))

    if (minShares === 0)
      throw new APIError(
        400,
        `You specified an answer to sell in which you have 0 shares.`
      )

    const betGroupId = crypto.randomBytes(12).toString('hex')
    const betResults = getCpmmMultiSellSharesInfo(
      contract,
      answers,
      nonRedemptionBetsByAnswerId,
      unfilledBets,
      balancesByUserId,
      loanAmountByAnswerId
    )
    log(`Calculated new bet information for ${user.username} - auth ${uid}.`)
    const bets = await Promise.all(
      betResults.map((newBetResult) =>
        executeNewBetResult(
          pgTrans,
          newBetResult,
          contract,
          user,
          isApi,
          undefined,
          betGroupId,
          deterministic
        )
      )
    )
    const loanPaid = sum(Object.values(loanAmountByAnswerId))
    if (loanPaid > 0 && bets.length > 0) {
      await incrementBalance(pgTrans, uid, {
        balance: -loanPaid,
      })
    }
    return { bets, contract }
  })

  log(`Main transaction finished - auth ${uid}.`)

  const continuation = async () => {
    const fullBets = bets.flatMap((result) => result.fullBets)
    const allOrdersToCancel = bets.flatMap((result) => result.allOrdersToCancel)
    const makers = bets.flatMap((result) => result.makers ?? [])
    const user = bets[0].user
    await onCreateBets(fullBets, contract, user, allOrdersToCancel, makers)
  }

  return {
    result: bets.map((result) => ({
      ...result.newBet,
      betId: result.betId,
      betGroupId: result.betGroupId,
    })),
    continue: continuation,
  }
}
