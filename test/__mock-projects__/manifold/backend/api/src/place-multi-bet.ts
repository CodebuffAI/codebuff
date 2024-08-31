import * as crypto from 'crypto'
import { APIError, type APIHandler } from './helpers/endpoint'
import { getNewMultiCpmmBetsInfo } from 'common/new-bet'
import { ValidatedAPIParams } from 'common/api/schema'
import { onCreateBets } from 'api/on-create-bet'
import {
  getRoundedLimitProb,
  executeNewBetResult,
  fetchContractBetDataAndValidate,
} from 'api/place-bet'
import { log } from 'shared/utils'
import { runShortTrans } from 'shared/short-transaction'
import { betsQueue } from 'shared/helpers/fn-queue'

export const placeMultiBet: APIHandler<'multi-bet'> = async (props, auth) => {
  const isApi = auth.creds.kind === 'key'

  return await betsQueue.enqueueFn(
    () => placeMultiBetMain(props, auth.uid, isApi),
    [auth.uid, props.contractId]
  )
}

// Note: this returns a continuation function that should be run for consistency.
export const placeMultiBetMain = async (
  body: ValidatedAPIParams<'multi-bet'>,
  uid: string,
  isApi: boolean
) => {
  const results = await runShortTrans(async (pgTrans) => {
    log(
      `Inside main transaction for ${uid} placing a bet on ${body.contractId}.`
    )

    const { user, contract, answers, unfilledBets, balanceByUserId } =
      await fetchContractBetDataAndValidate(pgTrans, body, uid, isApi)

    const { mechanism } = contract

    if (mechanism != 'cpmm-multi-1' || !('shouldAnswersSumToOne' in contract)) {
      throw new APIError(400, 'Contract type/mechanism not supported')
    }
    if (!answers) throw new APIError(404, 'Answers not found')

    const { shouldAnswersSumToOne } = contract
    const { answerIds, limitProb, expiresAt, deterministic } = body
    if (expiresAt && expiresAt < Date.now())
      throw new APIError(403, 'Bet cannot expire in the past.')

    const betOnAnswers = answers.filter((a) => answerIds.includes(a.id))
    if (!betOnAnswers) throw new APIError(404, 'Answers not found')
    if ('resolution' in betOnAnswers && betOnAnswers.resolution)
      throw new APIError(403, 'Answer is resolved and cannot be bet on')
    if (shouldAnswersSumToOne && answers.length < 2)
      throw new APIError(
        403,
        'Cannot bet until at least two answers are added.'
      )

    const roundedLimitProb = getRoundedLimitProb(limitProb)

    const newBetResults = getNewMultiCpmmBetsInfo(
      contract,
      answers,
      betOnAnswers,
      'YES',
      body.amount,
      roundedLimitProb,
      unfilledBets,
      balanceByUserId,
      expiresAt
    )

    log(`Calculated new bet information for ${user.username} - auth ${uid}.`)
    const betGroupId = crypto.randomBytes(12).toString('hex')
    return await Promise.all(
      newBetResults.map((newBetResult) =>
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
  })

  log(`Main transaction finished - auth ${uid}.`)
  const contract = results[0].contract

  const continuation = async () => {
    const fullBets = results.flatMap((result) => result.fullBets)
    const allOrdersToCancel = results.flatMap(
      (result) => result.allOrdersToCancel
    )
    const makers = results.flatMap((result) => result.makers ?? [])
    const user = results[0].user
    await onCreateBets(fullBets, contract, user, allOrdersToCancel, makers)
  }

  return {
    result: results.map((result) => ({
      ...result.newBet,
      betId: result.betId,
      betGroupId: result.betGroupId,
    })),
    continue: continuation,
  }
}
