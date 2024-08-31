import { type APIHandler } from './helpers/endpoint'
import {
  fetchContractBetDataAndValidate,
  getMakerIdsFromBetResult,
  placeBetMain,
  calculateBetResult,
} from 'api/place-bet'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { betsQueue } from 'shared/helpers/fn-queue'

export const placeBetter: APIHandler<'bet-ter'> = async (props, auth) => {
  const isApi = auth.creds.kind === 'key'

  let simulatedMakerIds: string[] = []
  if (props.deps === undefined) {
    const { user, contract, answers, unfilledBets, balanceByUserId } =
      await fetchContractBetDataAndValidate(
        createSupabaseDirectClient(),
        props,
        auth.uid,
        isApi
      )
    // Simulate bet to see whose limit orders you match.
    const simulatedResult = calculateBetResult(
      props,
      user,
      contract,
      answers,
      unfilledBets,
      balanceByUserId
    )
    simulatedMakerIds = getMakerIdsFromBetResult(simulatedResult)
  }

  const deps = [
    auth.uid,
    props.contractId,
    ...(props.deps ?? simulatedMakerIds),
  ]

  return await betsQueue.enqueueFn(
    () => placeBetMain(props, auth.uid, isApi),
    deps
  )
}
