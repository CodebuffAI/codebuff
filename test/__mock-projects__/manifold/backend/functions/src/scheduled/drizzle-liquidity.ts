import * as functions from 'firebase-functions'
import { CPMMContract, CPMMMultiContract } from 'common/contract'
import { mapAsync } from 'common/util/promise'
import { APIError } from 'common/api/utils'
import {
  addCpmmLiquidity,
  addCpmmLiquidityFixedP,
  addCpmmMultiLiquidityAnswersSumToOne,
  addCpmmMultiLiquidityToAnswersIndependently,
  getCpmmProbability,
} from 'common/calculate-cpmm'
import { formatMoneyWithDecimals } from 'common/util/format'
import { shuffle } from 'lodash'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { convertAnswer } from 'common/supabase/contracts'
import {
  getAnswer,
  getAnswersForContract,
  updateAnswer,
  updateAnswers,
} from 'shared/supabase/answers'
import { runShortTrans } from 'shared/short-transaction'
import { secrets } from 'common/secrets'
import { getContract, log } from 'shared/utils'
import { updateContract } from 'shared/supabase/contracts'

export const drizzleLiquidity = async () => {
  const pg = createSupabaseDirectClient()

  const data = await pg.manyOrNone<{ id: string }>(
    `select id from contracts where (data->'subsidyPool')::numeric > 1e-7`
  )
  const contractIds = shuffle(data.map((doc) => doc.id))
  log('found', contractIds.length, 'markets to drizzle')

  await mapAsync(contractIds, (cid) => drizzleMarket(cid), 10)

  const answers = await pg.map(
    `select * from answers where subsidy_pool > 1e-7`,
    [],
    convertAnswer
  )

  log('found', answers.length, 'answers to drizzle')

  await mapAsync(answers, (answer) => drizzleAnswer(pg, answer.id), 10)
}

export const drizzleLiquidityScheduler = functions
  .runWith({ memory: '1GB', timeoutSeconds: 540, secrets })
  .pubsub.schedule('*/7 * * * *')
  .onRun(drizzleLiquidity)

const drizzleMarket = async (contractId: string) => {
  await runShortTrans(async (pgTrans) => {
    const fetched = await getContract(pgTrans, contractId)
    if (!fetched) throw new APIError(404, 'Contract not found.')
    const contract = fetched as CPMMContract | CPMMMultiContract

    const { subsidyPool, slug, uniqueBettorCount } = contract
    if ((subsidyPool ?? 0) < 1e-7) return

    const r = Math.random()
    const v = (uniqueBettorCount ?? 0) < 50 ? 0.3 : 0.6
    const amount = subsidyPool <= 1 ? subsidyPool : r * v * subsidyPool

    if (contract.mechanism === 'cpmm-multi-1') {
      const answers = await getAnswersForContract(pgTrans, contractId)
      if (!answers.length) {
        return
      }

      const poolsByAnswer = Object.fromEntries(
        answers.map((a) => [a.id, { YES: a.poolYes, NO: a.poolNo }])
      )
      const newPools = contract.shouldAnswersSumToOne
        ? addCpmmMultiLiquidityAnswersSumToOne(poolsByAnswer, amount)
        : addCpmmMultiLiquidityToAnswersIndependently(poolsByAnswer, amount)

      const poolEntries = Object.entries(newPools).slice(0, 50_000)

      const answerUpdates = poolEntries.map(([answerId, newPool]) => ({
        id: answerId,
        poolYes: newPool.YES,
        poolNo: newPool.NO,
        prob: getCpmmProbability(newPool, 0.5),
      }))

      await updateAnswers(pgTrans, contractId, answerUpdates)

      await updateContract(pgTrans, contract.id, {
        subsidyPool: subsidyPool - amount,
      })
    } else {
      const { pool, p } = contract
      const { newPool, newP } = addCpmmLiquidity(pool, p, amount)

      if (!isFinite(newP)) {
        throw new APIError(
          500,
          'Liquidity injection rejected due to overflow error.'
        )
      }

      await updateContract(pgTrans, contract.id, {
        pool: newPool,
        p: newP,
        subsidyPool: subsidyPool - amount,
      })
    }

    log(
      'added subsidy',
      formatMoneyWithDecimals(amount),
      'of',
      formatMoneyWithDecimals(subsidyPool),
      'pool to',
      slug
    )
  })
}

const drizzleAnswer = async (pg: SupabaseDirectClient, answerId: string) => {
  await pg.tx(async (tx) => {
    const answer = await getAnswer(tx, answerId)
    if (!answer) return

    const { subsidyPool, poolYes, poolNo } = answer
    if ((subsidyPool ?? 0) < 1e-7) return

    const r = Math.random()
    const amount = subsidyPool <= 1 ? subsidyPool : r * 0.4 * subsidyPool

    const pool = { YES: poolYes, NO: poolNo }
    const { newPool } = addCpmmLiquidityFixedP(pool, amount)

    if (!isFinite(newPool.YES) || !isFinite(newPool.NO)) {
      throw new APIError(
        500,
        'Liquidity injection rejected due to overflow error.'
      )
    }

    await updateAnswer(tx, answerId, {
      poolYes: newPool.YES,
      poolNo: newPool.NO,
      prob: getCpmmProbability(newPool, 0.5),
      subsidyPool: subsidyPool - amount,
    })

    log(
      'added subsidy',
      newPool.YES - pool.YES,
      'YES and',
      newPool.NO - pool.NO,
      'NO:',
      formatMoneyWithDecimals(amount),
      'of',
      formatMoneyWithDecimals(subsidyPool),
      'pool to',
      answer.text
    )
  })
}
