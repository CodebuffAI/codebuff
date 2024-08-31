import { HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import { runScript } from 'run-script'
import { runTxn } from 'shared/txn/run-txn'
import { generateAntes } from 'api/create-market'
import { Contract } from 'common/contract'
import { Answer } from 'common/answer'
import { log } from 'shared/utils'
import { uniqBy } from 'lodash'

runScript(async ({ pg }) => {
  const contractAntes = await pg.manyOrNone<{
    amount: number
    user_id: string
    contract_id: string
    question: string
    slug: string
    resolution: string | null
    outcome_type: 'BINARY' | 'MULTIPLE_CHOICE'
    sums_to_one: boolean | null
    answers: Answer[] | null
  }>(
    `select
      t.amount,
      t.from_id as user_id,
      c.id as contract_id,
      c.question,
      c.slug,
      c.resolution,
      c.outcome_type,
      c.data->'shouldAnswersSumToOne' as sums_to_one,
      c.data->'answers' as answers
    from contracts c
    join txns t
    on c.id = t.to_id
    left join (select * from contract_liquidity where (data->'isAnte')::boolean = true) l
    on c.id = l.contract_id
    where c.created_time > '2024-07-23 16:46-0800'
    and c.mechanism != 'none'
    and l.contract_id is null
    and t.category = 'CREATE_CONTRACT_ANTE'`
  )

  // some contracts have answers added later which do have the correct ante liquidities
  const answerAntes = await pg.manyOrNone<{
    amount: number
    user_id: string
    contract_id: string
    question: string
    slug: string
    resolution: string | null
    outcome_type: 'BINARY' | 'MULTIPLE_CHOICE'
    sums_to_one: boolean | null
    answers: Answer[] | null
  }>(
    `with affected_answers as (
      select a.id, a.contract_id
      from answers a
      left join (select * from contract_liquidity where (data->'isAnte')::boolean = true) l
      on a.id = l.data->>'answerId'
      where a.id is not null
      and l.liquidity_id is null
      and a.created_time > '2024-07-23 16:46-0800'
    ),
    affected_contracts as (
      select distinct contract_id from affected_answers
    )
    select
      t.amount,
      t.from_id as user_id,
      c.id as contract_id,
      c.question,
      c.slug,
      c.resolution,
      c.outcome_type,
      c.data->'shouldAnswersSumToOne' as sums_to_one,
      c.data->'answers' as answers
    from contracts c
    join txns t
    on c.id = t.to_id
    where c.id in (select * from affected_contracts)
    and (c.data->'shouldAnswersSumToOne')::boolean = false
    and t.category = 'CREATE_CONTRACT_ANTE'`
  )

  log(
    `found ${contractAntes.length} contracts and ${answerAntes.length} indie multi contracts`
  )

  const allAntes = uniqBy([...contractAntes, ...answerAntes], 'contract_id')
  for (const c of allAntes) {
    log(`fixing [${c.question}](${c.slug})`)

    await pg.tx(async (tx) => {
      // reimburse creation cost if resolved
      if (c.resolution) {
        const message = `Reimbursement for creation cost of [${c.question}](${c.slug})`
        log(message + `: ${c.amount}`)
        await runTxn(tx, {
          fromId: HOUSE_LIQUIDITY_PROVIDER_ID,
          fromType: 'USER',
          toId: c.user_id,
          toType: 'USER',
          amount: c.amount,
          token: 'M$',
          category: 'MANA_PAYMENT',
          data: {
            message,
            isJul24Reimbursement: true,
            visibility: 'public',
          },
          description: message,
        })
      }

      // insert liquidity doc

      let originalAnswers: Answer[] | undefined = undefined
      if (c.outcome_type == 'MULTIPLE_CHOICE') {
        if (c.answers?.length) {
          const minCreated = Math.min(...c.answers.map((a) => a.createdTime))
          originalAnswers = c.answers.filter(
            (a) => a.createdTime === minCreated
          )
          const ante = c.amount / originalAnswers.length
          originalAnswers.forEach((ans) => {
            ans.poolYes = ante
            ans.poolNo = ante
          })
        } else {
          originalAnswers = []
        }
      }

      const initialPool = { YES: c.amount, NO: c.amount }
      const contract = {
        id: c.contract_id,
        mechanism: c.outcome_type === 'BINARY' ? 'cpmm-1' : 'cpmm-multi-1',
        outcomeType: c.outcome_type,
        pool: initialPool,
        shouldAnswersSumToOne: c.sums_to_one,
        answers: originalAnswers,
      } as any as Contract

      await generateAntes(
        tx,
        c.user_id,
        contract,
        c.outcome_type,
        c.amount,
        c.amount
      )
    })
  }
})
