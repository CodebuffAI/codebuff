import * as admin from 'firebase-admin'
import { sortBy, sumBy } from 'lodash'

import { initAdmin } from 'shared/init-admin'
initAdmin()

import { Contract, DPMBinaryContract } from 'common/contract'
import { Bet } from 'common/bet'
import {
  calculateDpmShares,
  getDpmProbability,
} from 'common/calculate-dpm'
import { getSellBetInfo } from 'common/sell-bet'

type DocRef = admin.firestore.DocumentReference

const firestore = admin.firestore()

async function recalculateContract(
  contractRef: DocRef,
  contract: Contract,
  isCommit = false
) {
  const startPool = (contract as any).startPool as
    | undefined
    | { YES: number; NO: number }

  if (!startPool) return

  console.log('recalculating', contract.slug)

  await firestore.runTransaction(async (transaction) => {
    const contractDoc = await transaction.get(contractRef)
    const contract = contractDoc.data() as DPMBinaryContract

    const betDocs = await transaction.get(contractRef.collection('bets'))
    const bets = sortBy(
      betDocs.docs.map((d) => d.data() as Bet),
      (b) => b.createdTime
    )

    const phantomAnte = startPool.YES + startPool.NO

    const leftovers =
      sumBy(bets, (b) => b.amount) -
      sumBy(bets, (b) => {
        if (!b.sale) return b.amount
        const soldBet = bets.find((bet) => bet.id === b.sale?.betId)
        return soldBet?.amount || 0
      })
    const poolTotal = contract.pool.YES + contract.pool.NO
    const prevTotalBets = contract.totalBets.YES + contract.totalBets.NO
    const calculatedrealAnte = poolTotal - prevTotalBets - leftovers

    const realAnte = Math.max(
      0,
      (contract as any).realAnte || calculatedrealAnte
    )

    if (!(contract as any).realAnte)
      transaction.update(contractRef, {
        realAnte,
      })

    console.log(
      'pool',
      poolTotal,
      'phantomAnte',
      phantomAnte,
      'realAnte',
      realAnte,
      'calculatedRealAnte',
      calculatedrealAnte,
      'leftovers',
      leftovers
    )

    let p = startPool.YES ** 2 / (startPool.YES ** 2 + startPool.NO ** 2)

    const phantomShares = {
      YES: Math.sqrt(p) * phantomAnte,
      NO: Math.sqrt(1 - p) * phantomAnte,
    }

    let totalShares = {
      YES: Math.sqrt(p) * (phantomAnte + realAnte),
      NO: Math.sqrt(1 - p) * (phantomAnte + realAnte),
    } as { [outcome: string]: number }

    let pool = { YES: p * realAnte, NO: (1 - p) * realAnte } as {
      [outcome: string]: number
    }

    let totalBets = { YES: p * realAnte, NO: (1 - p) * realAnte } as {
      [outcome: string]: number
    }

    const betsRef = contractRef.collection('bets')

    console.log('start', { pool, totalBets, totalShares })

    for (const bet of bets) {
      if (bet.sale) {
        const soldBet = bets.find((b) => b.id === bet.sale?.betId)
        if (!soldBet) throw new Error('invalid sold bet' + bet.sale.betId)

        const fakeContract: Contract = {
          ...contract,
          totalBets,
          totalShares,
          pool,
          phantomShares,
        }

        const { newBet, newPool, newTotalShares, newTotalBets } =
          getSellBetInfo(soldBet, fakeContract)

        const betDoc = betsRef.doc(bet.id)
        const userId = soldBet.userId
        newBet.createdTime = bet.createdTime
        console.log('sale bet', newBet)
        if (isCommit)
          transaction.update(betDoc, { id: bet.id, userId, ...newBet })

        pool = newPool
        totalShares = newTotalShares
        totalBets = newTotalBets

        continue
      }

      const shares = calculateDpmShares(totalShares, bet.amount, bet.outcome)
      const probBefore = p
      const ind = bet.outcome === 'YES' ? 1 : 0

      totalShares = {
        YES: totalShares.YES + ind * shares,
        NO: totalShares.NO + (1 - ind) * shares,
      }

      pool = {
        YES: pool.YES + ind * bet.amount,
        NO: pool.NO + (1 - ind) * bet.amount,
      }

      totalBets = {
        YES: totalBets.YES + ind * bet.amount,
        NO: totalBets.NO + (1 - ind) * bet.amount,
      }

      p = getDpmProbability(totalShares)

      const probAfter = p

      const betUpdate: Partial<Bet> = {
        shares,
        probBefore,
        probAfter,
      }

      console.log('bet', betUpdate)
      console.log('update', { pool, totalBets, totalShares })

      if (isCommit) transaction.update(betsRef.doc(bet.id), betUpdate)
    }

    const contractUpdate: Partial<Contract> = {
      pool,
      totalBets,
      totalShares,
      phantomShares,
    }

    console.log('final', contractUpdate)
    if (isCommit) transaction.update(contractRef, contractUpdate)
  })

  console.log('updated', contract.slug)
  console.log()
  console.log()
}

async function main() {
  const slug = process.argv[2]
  const isCommit = process.argv[3] === 'commit'

  const snap = await firestore
    .collection('contracts')
    .where('slug', '==', slug)
    .get()

  const contract = snap.docs[0]?.data() as Contract
  if (!contract) {
    console.log('No contract found for', slug)
    return
  }

  const contractRef = firestore.doc(`contracts/${contract.id}`)

  await recalculateContract(contractRef, contract, isCommit)
}

if (require.main === module) main().then(() => process.exit())
