import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import { orderBy } from 'lodash'
import { BetBalanceChange, TxnBalanceChange } from 'common/balance-change'
import { Txn } from 'common/txn'
import { filterDefined } from 'common/util/array'
import { charities } from 'common/charity'
import { convertTxn } from 'common/supabase/txns'
import { convertContract } from 'common/supabase/contracts'

// market creation fees
export const getBalanceChanges: APIHandler<'get-balance-changes'> = async (
  props
) => {
  const { after, userId } = props
  const [betBalanceChanges, txnBalanceChanges] = await Promise.all([
    getBetBalanceChanges(after, userId),
    getTxnBalanceChanges(after, userId),
  ])
  return orderBy(
    [...betBalanceChanges, ...txnBalanceChanges],
    (change) => change.createdTime,
    'desc'
  )
}

const getTxnBalanceChanges = async (after: number, userId: string) => {
  const pg = createSupabaseDirectClient()
  const balanceChanges = [] as TxnBalanceChange[]

  const txns = await pg.map(
    `select *
    from txns
    where created_time > millis_to_ts($1)
      and (to_id = $2 or from_id = $2)
    order by created_time`,
    [after, userId],
    convertTxn
  )
  const contractIds = filterDefined(
    txns.map((txn) => getContractIdFromTxn(txn))
  )
  const userIds = filterDefined(
    txns.map((txn) => getOtherUserIdFromTxn(txn, userId))
  )
  const contracts = await pg.map(
    `select data from contracts
    where id = any($1)`,
    [contractIds],
    convertContract
  )
  const users = await pg.map(
    `select id, username, name from users
    where id = any($1)`,
    [userIds],
    (row) => row
  )
  for (const txn of txns) {
    const contract = contracts.find((c) => c.id === getContractIdFromTxn(txn))
    const user = users.find((u) => u.id === getOtherUserIdFromTxn(txn, userId))
    const balanceChange: TxnBalanceChange = {
      key: txn.id,
      type: txn.category,
      token: txn.token,
      amount: txn.toId === userId ? txn.amount : -txn.amount,
      createdTime: txn.createdTime,
      description: txn.description,
      contract: contract
        ? {
            question:
              contract.visibility === 'public'
                ? contract.question
                : '[unlisted question]',
            visibility: contract.visibility,
            slug: contract.visibility === 'public' ? contract.slug : '',
            creatorUsername: contract.creatorUsername,
          }
        : undefined,
      questType: txn.data?.questType,
      user: user ? { username: user.username, name: user.name } : undefined,
      charity:
        txn.toType === 'CHARITY'
          ? {
              name:
                charities.find((c) => c.slug === txn.toId)?.name ?? txn.toId,
              slug: txn.toId,
            }
          : undefined,
    }
    balanceChanges.push(balanceChange)
  }
  return balanceChanges
}

const getOtherUserIdFromTxn = (txn: Txn, userId: string) => {
  if (txn.toType === 'USER' && txn.toId !== userId) {
    return txn.toId
  } else if (txn.fromType === 'USER' && txn.fromId !== userId) {
    return txn.fromId
  }
  return undefined
}
const getContractIdFromTxn = (txn: Txn) => {
  if (txn.fromType === 'CONTRACT') {
    return txn.fromId
  } else if (txn.toType === 'CONTRACT') {
    return txn.toId
  } else if ('data' in txn && txn.data?.contractId) {
    return txn.data.contractId
  }

  return null
}

const getBetBalanceChanges = async (after: number, userId: string) => {
  const pg = createSupabaseDirectClient()
  const contractToBets: {
    [contractId: string]: {
      bets: Bet[]
      contract: Contract
    }
  } = {}
  await pg.map(
    `
     select json_agg(cb.data) as bets, c.data as contract
     from contract_bets cb
              join contracts c on cb.contract_id = c.id
     where cb.updated_time > millis_to_ts($1)
        and cb.user_id = $2
     group by c.id;
    `,
    [after, userId],
    (row) => {
      contractToBets[row.contract.id] = {
        bets: orderBy(row.bets as Bet[], (bet) => bet.createdTime, 'asc'),
        contract: row.contract as Contract,
      }
    }
  )

  const balanceChanges = [] as BetBalanceChange[]
  for (const contractId of Object.keys(contractToBets)) {
    const { bets, contract } = contractToBets[contractId]

    for (let i = 0; i < bets.length; i++) {
      const bet = bets[i]
      const { isRedemption, outcome, createdTime, amount, shares } = bet
      // Bets get their loan amount updated recently, we want to discard them
      if (bet.limitProb === undefined && bet.createdTime < after) continue

      const nextBetExists = i < bets.length - 1
      const nextBetIsRedemption = nextBetExists && bets[i + 1].isRedemption
      if (isRedemption && nextBetIsRedemption) continue
      if (isRedemption && amount === 0) continue

      const { question, visibility, creatorUsername, slug } = contract
      const text =
        contract.mechanism === 'cpmm-multi-1' && bet.answerId
          ? contract.answers.find((a) => a.id === bet.answerId)?.text
          : undefined
      const balanceChangeProps = {
        key: bet.id,
        bet: {
          outcome,
          shares,
        },
        contract: {
          question: visibility === 'public' ? question : '[unlisted question]',
          slug: visibility === 'public' ? slug : '',
          visibility,
          creatorUsername,
        },
        answer: text && bet.answerId ? { text, id: bet.answerId } : undefined,
      }
      if (bet.limitProb !== undefined && bet.fills) {
        const fillsInTimeframe = bet.fills.filter(
          (fill) => fill.timestamp > after
        )
        for (const fill of fillsInTimeframe) {
          const balanceChange = {
            ...balanceChangeProps,
            key: `${bet.id}-${fill.timestamp}`,
            type: 'fill_bet',
            amount: -fill.amount,
            createdTime: fill.timestamp,
          } as BetBalanceChange
          balanceChanges.push(balanceChange)
        }
      } else {
        const changeToBalance = isRedemption ? Math.abs(shares) : -amount
        const balanceChange = {
          ...balanceChangeProps,
          type: isRedemption
            ? 'redeem_shares'
            : amount < 0
            ? 'sell_shares'
            : 'create_bet',
          amount: changeToBalance,
          createdTime,
        } as BetBalanceChange

        balanceChanges.push(balanceChange)
        if (!!bet.loanAmount && bet.loanAmount < 0) {
          balanceChanges.push({
            ...balanceChangeProps,
            key: `${bet.id}-loan-payment`,
            type: 'loan_payment',
            amount:
              bet.loanAmount +
              (isRedemption ? bets[i - 1]?.loanAmount ?? 0 : 0),
            createdTime: createdTime,
          } as BetBalanceChange)
        }
      }
    }
  }
  return balanceChanges
}
