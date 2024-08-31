import { Contract } from 'common/contract'
import { DAY_MS } from 'common/util/time'
import dayjs from 'dayjs'

const PROB_CHANGE_THRESHOLD = 0.05
export const getMarketMovementInfo = (contract: Contract) => {
  const nullCase = { ignore: true, probChange: undefined, startTime: undefined }
  // Now as the start of the hour to prevent rerenders on every ms change
  const now = dayjs().startOf('hour').valueOf()
  if (
    contract.mechanism !== 'cpmm-1' ||
    contract.isResolved ||
    contract.createdTime > now - DAY_MS
  ) {
    return nullCase
  }

  const previousProbAbout50 = (prob: number) => prob > 0.47 && prob < 0.53
  const probChangeIsSignificant = (probChange: number) =>
    Math.abs(probChange) > PROB_CHANGE_THRESHOLD

  const startTime = now - DAY_MS
  const probChangeSince = contract.probChanges.day
  const previousProb = contract.prob - probChangeSince

  if (
    contract.createdTime > now - 2 * DAY_MS &&
    previousProbAbout50(previousProb)
  ) {
    return nullCase
  }

  // Probability change must exceed the threshold
  if (!probChangeIsSignificant(probChangeSince)) {
    return nullCase
  }

  const probChange = Math.round(probChangeSince * 100)

  return { ignore: false, probChange, startTime }
}
