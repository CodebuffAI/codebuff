import { groupBy, mapValues, maxBy, sortBy, sum, uniqBy } from 'lodash'
import { Firestore } from 'firebase-admin/firestore'
import {
  CPMMMultiContract,
  DpmMultipleChoiceContract,
  FreeResponseContract,
  contractPath,
} from 'common/contract'
import { runScript } from './run-script'
import {
  getUsers,
  isProd,
  log,
  revalidateContractStaticProps,
} from 'shared/utils'
import { Answer, DpmAnswer } from 'common/answer'
import { randomString } from 'common/util/random'
import { getDpmOutcomeProbability } from 'common/calculate-dpm'
import { Bet } from 'common/bet'
import { removeUndefinedProps } from 'common/util/object'
import { noFees } from 'common/fees'
import { calculateUserMetrics } from 'common/calculate-metrics'
import { bulkUpdateContractMetrics } from 'shared/helpers/user-contract-metrics'
import { randomUUID } from 'crypto'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { writeJson } from 'shared/helpers/file'

if (require.main === module) {
  runScript(async ({ pg, firestore }) => {
    log('Migrating multi DPM to CPMM...')

    const contracts = await pg.map(
      `select data from contracts
       where
        mechanism = 'dpm-2'
        and (outcome_type = 'MULTIPLE_CHOICE' or outcome_type = 'FREE_RESPONSE')
        order by importance_score desc
        `,
      [],
      (r) => r.data as DpmMultipleChoiceContract
    )

    // const contractToMigrate = contracts[0]
    // console.log('https://manifold.markets' + contractPath(contractToMigrate))
    // await migrateMultiDpmToCpmm(firestore, contractToMigrate)

    const sortedContracts = sortBy(contracts, (c) => -1 * c.uniqueBettorCount)
    console.log('Got', contracts.length, 'contracts')
    console.log(
      sortedContracts
        .map((c) => 'https://manifold.markets' + contractPath(c))
        .join('\n')
    )

    for (const contract of sortedContracts) {
      await migrateMultiDpmToCpmm(firestore, contract)
    }
  })
}

const getAnswersAndBets = async (
  firestore: Firestore,
  contract: DpmMultipleChoiceContract | FreeResponseContract
) => {
  const answersSnap = await firestore
    .collection('contracts')
    .doc(contract.id)
    .collection('answers')
    .get()

  const answers = sortBy(
    answersSnap.docs.map((d) => d.data() as DpmAnswer),
    (a) => a.number
  )
  const betsSnap = await firestore
    .collection('contracts')
    .doc(contract.id)
    .collection('bets')
    .get()
  const bets = sortBy(
    betsSnap.docs.map((d) => d.data() as Bet),
    (b) => b.createdTime
  )

  return { answers, bets }
}

const migrateMultiDpmToCpmm = async (
  firestore: Firestore,
  contract: DpmMultipleChoiceContract | FreeResponseContract
) => {
  // Save a log of contract, bets. Just in case.

  // Modify firestore documents in place.
  // New contract
  // New answers
  // New bets
  // Liquidity
  // user_contract_metrics

  console.log('Migrating', contract.question)
  console.log('https://manifold.markets' + contractPath(contract))

  const { totalShares } = contract

  const { answers, bets } = await getAnswersAndBets(firestore, contract)
  const answerProbs = answers.map((a) =>
    getDpmOutcomeProbability(totalShares, a.id)
  )
  const betsByAnswerId = groupBy(bets, (b) => b.outcome)

  const liquidityByAnswerId = mapValues(
    betsByAnswerId,
    (bets) => 20 * uniqBy(bets, (b) => b.userId).length + 200 / answers.length
  )
  const totalLiquidity = sum(Object.values(liquidityByAnswerId))

  const newAnswers: Answer[] = answers.map((a, i) => {
    const prob = Math.max(0.0001, answerProbs[i])
    const liquidityAmount = liquidityByAnswerId[a.id]

    const minProb = Math.min(prob, 1 - prob)
    const answerPoolLiqudity = 2 * minProb * liquidityAmount

    // prob = poolNo / (poolYes + poolNo)
    // sqrt(poolYes * poolNo) = totalLiquidity

    // poolNo = prob * (poolYes + poolNo)
    // (1-prob) * poolNo = prob * poolYes
    // poolNo = prob * poolYes / (1 - prob)
    // poolYes * poolNo = totalLiquidity^2
    // poolYes = totalLiquidity^2 / poolNo
    // poolYes = totalLiquidity^2 / (prob * poolYes / (1 - prob))
    // poolYes^2 * (prob / (1 - prob)) = totalLiquidity^2
    // poolYes = sqrt(totalLiquidity^2 / (prob / (1 - prob)))
    // poolNo = totalLiquidity^2 / poolYes

    // prob = 0.2
    // totalLiquditity = 200
    // poolYes 400, poolNo 100
    // 100 / (400 + 100) = 0.2
    const poolYes = Math.sqrt(answerPoolLiqudity ** 2 / (prob / (1 - prob)))
    const poolNo = answerPoolLiqudity ** 2 / poolYes

    const isOther =
      a.text === 'None' && contract.outcomeType === 'FREE_RESPONSE'

    return {
      contractId: a.contractId,
      text: isOther ? 'Other' : a.text,
      userId: a.userId,
      createdTime: a.createdTime,
      id: randomString(),
      index: a.number,
      isOther,
      poolYes,
      poolNo,
      prob,
      totalLiquidity: answerPoolLiqudity,
      subsidyPool: 0,
      probChanges: {
        day: 0,
        month: 0,
        week: 0,
      },
    }
  })

  const totalProb = sum(newAnswers.map((a) => a.prob))

  // Fix probabilility sum to 1 after min prob for each answer.
  const largestAnswer = maxBy(newAnswers, (a) => a.prob)
  const probDiff = totalProb - 1
  if (totalProb > 1.0000001 && largestAnswer && largestAnswer.prob > probDiff) {
    const prob = largestAnswer.prob - probDiff
    const { totalLiquidity } = largestAnswer
    const poolYes = Math.sqrt(totalLiquidity ** 2 / (prob / (1 - prob)))
    const poolNo = totalLiquidity ** 2 / poolYes
    largestAnswer.prob = prob
    largestAnswer.poolYes = poolYes
    largestAnswer.poolNo = poolNo
  }
  console.log(
    'answer probs',
    newAnswers.map((a) => a.prob),
    sum(newAnswers.map((a) => a.prob))
  )

  const newBets: Bet[] = bets.map((b) => {
    const answerIndex = answers.findIndex((a) => a.id === b.outcome)
    const newAnswer = newAnswers[answerIndex]

    const averagePrice = Math.sqrt(b.probBefore * b.probAfter)
    let shares = b.amount / averagePrice
    if (b.sale) {
      const originalBet = bets.find((b2) => b2.id === b.sale?.betId)
      if (!originalBet) {
        console.error('original bet not found', b.sale?.betId)
      } else {
        // Take negative shares of converted original bet.
        const originalBetAvgPrice = Math.sqrt(
          originalBet.probBefore * originalBet.probAfter
        )
        shares = -originalBet.amount / originalBetAvgPrice
      }
    }

    return removeUndefinedProps({
      id: b.id,
      userId: b.userId,
      contractId: contract.id,
      answerId: newAnswer.id,
      amount: b.amount,
      shares,
      createdTime: b.createdTime,
      loanAmount: b.loanAmount,
      outcome: 'YES',
      probBefore: b.probBefore,
      probAfter: b.probAfter,
      fees: noFees,
      isApi: false,
      isAnte: false,
      isRedemption: false,
      visibility: 'public',
      userAvatarUrl: b.userAvatarUrl,
      userUsername: b.userUsername,
      userName: b.userName,
    })
  })

  const {
    totalShares: _,
    totalBets: __,
    phantomShares: ___,
    pool: ____,
    resolution: _____,
    resolutions: ______,
    ...otherContractProps
  } = contract

  const newResolutions = getNewResolutions(contract, answers, newAnswers)

  const newContract: CPMMMultiContract = removeUndefinedProps({
    ...otherContractProps,
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: true,
    addAnswersMode:
      contract.outcomeType === 'FREE_RESPONSE' ? 'ANYONE' : 'DISABLED',
    totalLiquidity,
    subsidyPool: 0,
    answers: newAnswers,
    ...newResolutions,
  })

  const providerId = isProd()
    ? HOUSE_LIQUIDITY_PROVIDER_ID
    : DEV_HOUSE_LIQUIDITY_PROVIDER_ID
  const liquidities = newAnswers.map((a) => ({
    answerId: a.id,
    constractId: contract.id,
    amount: a.totalLiquidity,
    createdTime: Date.now(),
    id: randomUUID(),
    liquidity: a.totalLiquidity,
    userId: providerId,
  }))

  const userIds = uniqBy(bets, (b) => b.userId).map((b) => b.userId)
  const users = await getUsers(userIds)
  const userContractMetrics = users.flatMap((user) =>
    calculateUserMetrics(
      newContract,
      newBets.filter((b) => b.userId === user.id),
      user,
      newAnswers
    )
  )

  console.log(
    'Saving contract, answers, bets, liquidity, user contract metrics'
  )

  await firestore.collection('contracts').doc(contract.id).set(newContract)
  console.log('Saved contract', newContract.id)

  for (let i = 0; i < answers.length; i++) {
    const answer = answers[i]
    await firestore
      .collection('contracts')
      .doc(contract.id)
      .collection('answers')
      .doc(answer.id)
      .delete()

    const newAnswer = newAnswers[i]
    await firestore
      .collection('contracts')
      .doc(contract.id)
      .collection('answersCpmm')
      .doc(newAnswer.id)
      .set(newAnswer)
  }
  console.log('Saved answers')

  const writer = firestore.bulkWriter()
  for (const bet of newBets) {
    writer.set(
      firestore
        .collection('contracts')
        .doc(contract.id)
        .collection('bets')
        .doc(bet.id),
      bet
    )
  }
  await writer.close()
  console.log('Saved bets')

  for (const liquidity of liquidities) {
    await firestore
      .collection('contracts')
      .doc(contract.id)
      .collection('liquidity')
      .doc(liquidity.id)
      .set(liquidity)
  }
  console.log('Saved liquidities')

  await bulkUpdateContractMetrics(userContractMetrics)
  console.log('Saved userContractMetrics')

  await revalidateContractStaticProps(contract)
}

export const dpmMarketDataDump = async (
  pg: SupabaseDirectClient,
  firestore: Firestore
) => {
  const contracts = await pg.map(
    `select data from contracts
       where
        resolution is null
        and mechanism = 'dpm-2'
        and (outcome_type = 'MULTIPLE_CHOICE' or outcome_type = 'FREE_RESPONSE')
        order by importance_score desc
        `,
    [],
    (r) => r.data as DpmMultipleChoiceContract
  )
  const jsonBlob: { [key: string]: any } = {}
  for (const contract of contracts) {
    const { answers, bets } = await getAnswersAndBets(firestore, contract)
    console.log('https://manifold.markets' + contractPath(contract))
    jsonBlob[contract.id] = contract
    jsonBlob[`${contract.id}-bets`] = bets
    jsonBlob[`${contract.id}-answers`] = answers
  }

  console.log('Writing json file')
  await writeJson('dpm-market-data.json', jsonBlob)
}

const getNewResolutions = (
  contract: DpmMultipleChoiceContract | FreeResponseContract,
  answers: DpmAnswer[],
  newAnswers: Answer[]
) => {
  const { resolution, resolutions } = contract
  if (resolution === 'CANCEL') {
    return {
      resolution: 'CANCEL',
    }
  }
  if (resolutions) {
    const newResolutions: { [key: string]: number } = {}
    for (const [outcome, weight] of Object.entries(resolutions)) {
      const answerIndex = answers.findIndex((a) => a.id === outcome)
      const newAnswer = newAnswers[answerIndex]
      newResolutions[newAnswer.id] = weight
    }
    return {
      resolution: 'MKT',
      resolutions: newResolutions,
    }
  }

  if (resolution) {
    const answerIndex = answers.findIndex((a) => a.id === resolution)
    const newAnswer = newAnswers[answerIndex]
    return {
      resolution: newAnswer.id,
      resolutions: {
        [newAnswer.id]: 100,
      },
    }
  }

  return undefined
}
