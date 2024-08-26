import { QUEST_DETAILS, QUEST_TYPES } from 'common/quest'
import { getQuestScores } from 'common/supabase/set-scores'
import { User } from 'common/user'
import { filterDefined } from 'common/util/array'
import { sum } from 'lodash'
import { useEffect, useState } from 'react'
import { hasCompletedStreakToday } from 'web/components/profile/betting-streak-modal'
import { db } from 'web/lib/supabase/db'

export const useQuestStatus = (user: User | undefined | null) => {
  const [questStatus, setQuestStatus] = useState<
    Awaited<ReturnType<typeof getQuestCompletionStatus>> | undefined
  >(undefined)
  useEffect(() => {
    if (user) {
      getQuestCompletionStatus(user).then(setQuestStatus)
    }
  }, [user?.id])
  return questStatus
}

const getQuestCompletionStatus = async (user: User) => {
  const questTypes = QUEST_TYPES
  const questToCompletionStatus = Object.fromEntries(
    questTypes.map((t) => [t, { requiredCount: 0, currentCount: 0 }])
  )
  const keys = questTypes.map((questType) => QUEST_DETAILS[questType].scoreId)
  const scores = await getQuestScores(user.id, keys, db)

  questTypes.forEach((questType) => {
    const questData = QUEST_DETAILS[questType]
    if (questType === 'BETTING_STREAK')
      questToCompletionStatus[questType] = {
        requiredCount: questData.requiredCount,
        currentCount: hasCompletedStreakToday(user) ? 1 : 0,
      }
    else
      questToCompletionStatus[questType] = {
        requiredCount: questData.requiredCount,
        currentCount: scores[questData.scoreId].score,
      }
  })

  const totalQuestsCompleted = sum(
    Object.values(questToCompletionStatus).map((v) =>
      v.currentCount >= v.requiredCount ? 1 : 0
    )
  )
  const incompleteQuestTypes = filterDefined(
    Object.entries(questToCompletionStatus).map(([k, v]) =>
      v.currentCount < v.requiredCount ? k : null
    )
  )

  const totalQuests = Object.keys(questToCompletionStatus).length
  const allQuestsComplete = totalQuestsCompleted === totalQuests

  return {
    questToCompletionStatus,
    totalQuestsCompleted,
    totalQuests,
    allQuestsComplete,
    incompleteQuestTypes,
  }
}
