import { Contract } from 'common/contract'
import { getPrivateUser, getUser, isProd } from 'shared/utils'
import { createMarketClosedNotification } from 'shared/create-notification'
import { DAY_MS } from 'common/util/time'
import { convertContract } from 'common/supabase/contracts'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { bulkUpdate, bulkUpdateData } from 'shared/supabase/utils'

const SEND_NOTIFICATIONS_EVERY_DAYS = 5

export async function sendMarketCloseEmails() {
  if (!isProd()) {
    console.log('Not prod, not sending emails')
    return
  }

  const pg = createSupabaseDirectClient()
  const contracts = await pg.tx(async (tx) => {
    const contracts = await tx.map(
      `select * from contracts where
      resolution_time is null and close_time < now()
      and outcome_type not in ('POLL', 'BOUNTIED_QUESTION')`,
      [],
      convertContract
    )
    console.log(`Found ${contracts.length} closed contracts`)
    const needsNotification = contracts.filter((contract) =>
      shouldSendFirstOrFollowUpCloseNotification(contract)
    )
    console.log(`Found ${needsNotification.length} notifications to send`)

    await bulkUpdateData(
      pg,
      'contracts',
      needsNotification.map((c) => ({
        id: c.id,
        closeEmailsSent: (c.closeEmailsSent ?? 0) + 1,
      }))
    )
    return needsNotification
  })

  for (const contract of contracts) {
    console.log(
      'sending close email for',
      contract.slug,
      'closed',
      contract.closeTime
    )

    const user = await getUser(contract.creatorId)
    if (!user) continue

    const privateUser = await getPrivateUser(user.id)
    if (!privateUser) continue

    await createMarketClosedNotification(
      contract,
      user,
      privateUser,
      contract.id + '-closed-at-' + contract.closeTime
    )
  }
}

// The downside of this approach is if this function goes down for the entire
// day of a multiple of the time period after the market has closed, it won't
// keep sending them notifications bc when it comes back online the time period will have passed
function shouldSendFirstOrFollowUpCloseNotification(contract: Contract) {
  if (contract.outcomeType == 'BOUNTIED_QUESTION') return false
  if (!contract.closeEmailsSent || contract.closeEmailsSent === 0) return true
  const { closedMultipleOfNDaysAgo, fullTimePeriodsSinceClose } =
    marketClosedMultipleOfNDaysAgo(contract)
  return (
    contract.closeEmailsSent > 0 &&
    closedMultipleOfNDaysAgo &&
    contract.closeEmailsSent === fullTimePeriodsSinceClose
  )
}

function marketClosedMultipleOfNDaysAgo(contract: Contract) {
  const now = Date.now()
  const closeTime = contract.closeTime
  if (!closeTime)
    return { closedMultipleOfNDaysAgo: false, fullTimePeriodsSinceClose: 0 }
  const daysSinceClose = Math.floor((now - closeTime) / DAY_MS)
  return {
    closedMultipleOfNDaysAgo:
      daysSinceClose % SEND_NOTIFICATIONS_EVERY_DAYS == 0,
    fullTimePeriodsSinceClose: Math.floor(
      daysSinceClose / SEND_NOTIFICATIONS_EVERY_DAYS
    ),
  }
}
