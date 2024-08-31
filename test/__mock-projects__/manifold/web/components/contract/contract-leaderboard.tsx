import { formatMoney } from 'common/util/format'

import { BETTORS, User } from 'common/user'
import { useEffect, useState } from 'react'
import { ContractMetric } from 'common/contract-metric'
import { removeUndefinedProps } from 'common/util/object'
import { Leaderboard } from 'web/components/leaderboard'
import { db } from 'web/lib/supabase/db'
import { getRanking } from 'common/supabase/contract-metrics'

export function ContractLeaderboard(props: {
  topContractMetrics: ContractMetric[]
  currentUser: User | undefined | null
  contractId: string
  currentUserMetrics: ContractMetric | undefined
}) {
  const { topContractMetrics, currentUser, contractId, currentUserMetrics } =
    props
  const maxToShowMinusCurrentUser = 5
  const topRankedUserIds = topContractMetrics
    .slice(0, maxToShowMinusCurrentUser)
    .map((m) => m.userId)
  const userIsAlreadyRanked =
    currentUser && topRankedUserIds.includes(currentUser.id)
  const [yourRank, setYourRank] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (currentUserMetrics?.profit && !yourRank && !userIsAlreadyRanked) {
      getRanking(contractId, currentUserMetrics.profit, db).then((rank) =>
        setYourRank(rank)
      )
    }
  }, [currentUserMetrics?.profit, yourRank, contractId, userIsAlreadyRanked])

  const allMetrics =
    currentUserMetrics && currentUser && !userIsAlreadyRanked
      ? [
          ...topContractMetrics.slice(0, maxToShowMinusCurrentUser),
          {
            ...currentUserMetrics,
            userName: currentUser.username,
            userId: currentUser.id,
            userAvatarUrl: currentUser.avatarUrl,
            userUsername: currentUser.username,
          } as ContractMetric,
        ]
      : topContractMetrics

  const userProfits = allMetrics
    // exclude house bot from question leaderboard
    .filter((cm) => cm.userName !== 'acc' || currentUser?.username === 'acc')
    .map((cm) => {
      const { profit } = cm
      return removeUndefinedProps({
        id: cm.userId,
        name: cm.userName,
        username: cm.userUsername,
        avatarUrl: cm.userAvatarUrl,
        total: profit,
        rank:
          cm.userId === currentUser?.id && !userIsAlreadyRanked
            ? yourRank
              ? yourRank
              : maxToShowMinusCurrentUser + 1
            : topContractMetrics.indexOf(cm) + 1,
      })
    })
  const top = Object.values(userProfits)
    .sort((a, b) => b.total - a.total)
    .filter((p) => p.total > 0)
    .slice(
      0,
      !currentUser || userIsAlreadyRanked || !currentUserMetrics
        ? maxToShowMinusCurrentUser
        : maxToShowMinusCurrentUser + 1
    )

  return top && top.length > 0 ? (
    <Leaderboard
      title={`🏅 Top ${BETTORS}`}
      entries={top || []}
      columns={[
        {
          header: 'Total profit',
          renderCell: (entry) => formatMoney(entry.total),
        },
      ]}
      className="mt-12"
      highlightUsername={currentUser?.username}
    />
  ) : null
}
