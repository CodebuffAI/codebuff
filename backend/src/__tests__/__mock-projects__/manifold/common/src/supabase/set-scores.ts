import { run, SupabaseClient } from 'common/supabase/utils'
import { QUEST_DETAILS, QuestType } from 'common/quest'

export async function setQuestScoreValue(
  userId: string,
  scoreId: string,
  scoreValue: number,
  db: SupabaseClient,
  idempotencyKey?: string
) {
  const { data } = await run(
    db.from('user_quest_metrics').upsert({
      user_id: userId,
      score_id: scoreId,
      score_value: scoreValue,
      idempotency_key: idempotencyKey,
    })
  )
  return data
}

// TODO: To reduce writes, we could just reset quest stats where users already have a score saved
export async function setQuestScoreValueOnUsers(
  userIds: string[],
  scoreIds: string[],
  scoreValue: number,
  db: SupabaseClient,
  idempotencyKey?: string
) {
  const values = scoreIds
    .map((scoreId) =>
      userIds.map((userId) => ({
        user_id: userId,
        score_id: scoreId,
        score_value: scoreValue,
        idempotency_key: idempotencyKey,
      }))
    )
    .flat()

  const { data } = await run(db.from('user_quest_metrics').upsert(values))
  return data
}

export async function getQuestScores(
  userId: string,
  scoreIds: string[],
  db: SupabaseClient
) {
  const { data } = await run(
    db
      .from('user_quest_metrics')
      .select('score_id, score_value, idempotency_key')
      .eq('user_id', userId)
      .in('score_id', scoreIds)
  )
  const scoreIdsToValue: {
    [key: string]: {
      score: number
      idempotencyKey: string | undefined | null
    }
  } = {}
  scoreIds.forEach((scoreId) => {
    const score = data?.find((s) => s.score_id === scoreId)
    scoreIdsToValue[scoreId] = {
      score: score?.score_value ?? 0,
      idempotencyKey: score?.idempotency_key,
    }
  })
  return scoreIdsToValue
}

export async function getQuestScore(
  userId: string,
  questType: QuestType,
  db: SupabaseClient
) {
  const scoreId = QUEST_DETAILS[questType].scoreId
  const scores = await getQuestScores(userId, [scoreId], db)
  return scores[scoreId]
}
