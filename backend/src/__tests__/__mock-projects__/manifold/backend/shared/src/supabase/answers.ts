import { type SupabaseDirectClient } from 'shared/supabase/init'
import { convertAnswer } from 'common/supabase/contracts'
import { groupBy, mapValues, sortBy } from 'lodash'
import { Answer } from 'common/answer'
import { bulkInsert, bulkUpdate, insert, update } from './utils'
import { removeUndefinedProps } from 'common/util/object'
import { millisToTs, Row } from 'common/supabase/utils'
import {
  broadcastNewAnswer,
  broadcastUpdatedAnswers,
} from 'shared/websockets/helpers'

export const getAnswer = async (pg: SupabaseDirectClient, id: string) => {
  const row = await pg.oneOrNone(`select * from answers where id = $1`, [id])
  return row ? convertAnswer(row) : null
}

export const getAnswersForContractsDirect = async (
  pg: SupabaseDirectClient,
  contractIds: string[]
) => {
  if (contractIds.length === 0) {
    return {}
  }
  const answers = await pg.map(
    `select * from answers
            where contract_id in ($1:list)`,
    [contractIds],
    (r) => convertAnswer(r)
  )
  return mapValues(groupBy(answers, 'contractId'), (answers) =>
    sortBy(answers, 'index')
  )
}

export const getAnswersForContract = async (
  pg: SupabaseDirectClient,
  contractId: string
) => {
  // Answers must be sorted by index, or you get non-deterministic results
  return await pg.map(
    `select * from answers where contract_id = $1
            order by index`,
    [contractId],
    convertAnswer
  )
}

export const insertAnswer = async (
  pg: SupabaseDirectClient,
  ans: Omit<Answer, 'id'>
) => {
  const row = await insert(pg, 'answers', answerToRow(ans))
  broadcastNewAnswer(convertAnswer(row))
}

export const bulkInsertAnswers = async (
  pg: SupabaseDirectClient,
  answers: Omit<Answer, 'id'>[]
) => {
  if (answers.length > 0) {
    const rows = await bulkInsert(pg, 'answers', answers.map(answerToRow))
    rows.map(convertAnswer).forEach(broadcastNewAnswer)
  }
}

export const updateAnswer = async (
  pg: SupabaseDirectClient,
  answerId: string,
  data: Partial<Answer>
) => {
  const row = await update(
    pg,
    'answers',
    'id',
    partialAnswerToRow({ ...data, id: answerId })
  )
  const answer = convertAnswer(row)
  broadcastUpdatedAnswers(answer.contractId, [answer])
  return answer
}

export const updateAnswers = async (
  pg: SupabaseDirectClient,
  contractId: string,
  updates: (Partial<Answer> & { id: string })[]
) => {
  await bulkUpdate(pg, 'answers', ['id'], updates.map(partialAnswerToRow))

  broadcastUpdatedAnswers(contractId, updates)
}

// Can update answers across multiple contracts.
export const bulkUpdateAnswers = async (
  pg: SupabaseDirectClient,
  updates: Partial<Answer>[]
) => {
  await bulkUpdate(pg, 'answers', ['id'], updates.map(partialAnswerToRow))
}

const answerToRow = (answer: Omit<Answer, 'id'> & { id?: string }) => ({
  id: answer.id,
  index: answer.index,
  contract_id: answer.contractId,
  user_id: answer.userId,
  text: answer.text,
  color: answer.color,
  pool_yes: answer.poolYes,
  pool_no: answer.poolNo,
  prob: answer.prob,
  total_liquidity: answer.totalLiquidity,
  subsidy_pool: answer.subsidyPool,
  created_time: answer.createdTime
    ? millisToTs(answer.createdTime) + '::timestamptz'
    : undefined,
  is_other: answer.isOther,
  resolution: answer.resolution,
  resolution_time: answer.resolutionTime
    ? millisToTs(answer.resolutionTime) + '::timestamptz'
    : undefined,
  resolution_probability: answer.resolutionProbability,
  resolver_id: answer.resolverId,
  prob_change_day: answer.probChanges?.day,
  prob_change_week: answer.probChanges?.week,
  prob_change_month: answer.probChanges?.month,
})

// does not convert isOther, loverUserId
const partialAnswerToRow = (answer: Partial<Answer>) => {
  const partial: any = removeUndefinedProps(answerToRow(answer as any))
  delete partial.data
  return partial as Partial<Row<'answers'>>
}
