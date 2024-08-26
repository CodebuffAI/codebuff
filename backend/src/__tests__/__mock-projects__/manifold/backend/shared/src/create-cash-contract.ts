import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from './supabase/init'
import { getContract, getUser, htmlToRichText, log } from './utils'
import { runTxnFromBank } from './txn/run-txn'
import { APIError } from 'common/api/utils'
import { updateContract } from './supabase/contracts'
import { randomString } from 'common/util/random'
import { getNewContract } from 'common/new-contract'
import { convertContract } from 'common/supabase/contracts'
import { clamp } from 'lodash'

// cribbed from backend/api/src/create-market.ts

export async function createCashContract(
  manaContractId: string,
  subsidyAmount: number,
  pg?: SupabaseDirectClient
) {
  const client = pg || createSupabaseDirectClient()

  return await client.tx(async (tx) => {
    const manaContract = await getContract(tx, manaContractId)
    if (!manaContract) {
      throw new APIError(404, `Mana contract ${manaContractId} not found`)
    }

    const creator = await getUser(manaContract.creatorId)

    if (!creator) {
      throw new APIError(404, `Creator ${manaContract.creatorId} not found`)
    }

    if (manaContract.token !== 'MANA') {
      throw new APIError(
        400,
        `Contract ${manaContractId} is not a MANA contract`
      )
    }

    if (manaContract.outcomeType !== 'BINARY') {
      throw new APIError(
        400,
        `Contract ${manaContractId} is not a binary contract`
      )

      // TODO: Add support for multi
    }

    const contract = getNewContract({
      id: randomString(),
      ante: subsidyAmount,
      token: 'CASH',
      description: htmlToRichText('<p></p>'),
      initialProb: clamp(Math.round(manaContract.prob * 100), 1, 99),

      creator,
      slug: manaContract.slug + '--cash',
      question: manaContract.question,
      outcomeType: manaContract.outcomeType,
      closeTime: manaContract.closeTime,
      visibility: manaContract.visibility,
      isTwitchContract: manaContract.isTwitchContract,

      min: 0,
      max: 0,
      isLogScale: false,
      answers: [],
    })

    const newRow = await tx.one(
      `insert into contracts (id, data, token) values ($1, $2, $3) returning *`,
      [contract.id, JSON.stringify(contract), contract.token]
    )
    const cashContract = convertContract(newRow)

    // Set sibling contract IDs
    await updateContract(tx, manaContractId, {
      siblingContractId: cashContract.id,
    })
    await updateContract(tx, cashContract.id, {
      siblingContractId: manaContractId,
    })

    // Add initial liquidity
    await runTxnFromBank(tx, {
      amount: subsidyAmount,
      category: 'CREATE_CONTRACT_ANTE',
      toId: cashContract.id,
      toType: 'CONTRACT',
      fromType: 'BANK',
      token: 'CASH',
    })

    log(
      `Created cash contract ${cashContract.id} for mana contract ${manaContractId}`
    )

    return cashContract
  })
}
