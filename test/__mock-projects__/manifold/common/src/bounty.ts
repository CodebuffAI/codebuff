import { BountiedQuestionContract } from './contract'
import { DAY_MS } from './util/time'

export const getAutoBountyPayoutPerHour = (
  contract: BountiedQuestionContract
) => {
  const { createdTime, bountyLeft } = contract
  const minPercent = 0.01
  const maxPercent = 0.05
  const fracTo2Days = Math.min((Date.now() - createdTime) / (2 * DAY_MS), 1)
  const fracPayoutPerHour = minPercent + (maxPercent - minPercent) * fracTo2Days
  return bountyLeft * fracPayoutPerHour
}
