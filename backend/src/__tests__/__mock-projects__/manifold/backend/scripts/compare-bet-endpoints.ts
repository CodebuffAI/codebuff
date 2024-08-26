import { runScript } from './run-script'
import { isProd, log } from 'shared/utils'
import { Contract, MultiContract } from 'common/contract'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { getTestUsers } from 'shared/test/users'
import { getRandomTestBet } from 'shared/test/bets'
import { ValidatedAPIParams } from 'common/api/schema'
import { ContractMetric } from 'common/contract-metric'
import { convertContract } from 'common/supabase/contracts'
import { floatingEqual } from 'common/util/math'
import { APIError } from 'common/api/utils'
import { Bet } from 'common/bet'

type APIVariant = {
  getBetEndpoint: () => string
  getSellEndpoint: (contractId: string) => string
}

const DEFAULT_VARIANT: APIVariant = {
  getBetEndpoint: () => 'bet',
  getSellEndpoint: (contractId: string) => `market/${contractId}/sell`,
}
const TEST_VARIANT: APIVariant = {
  getBetEndpoint: () => 'bet',
  getSellEndpoint: (contractId: string) => `market/${contractId}/sell`,
}

// const API_URL = `https://${DEV_CONFIG.apiEndpoint}/v0`
const API_URL = `http://localhost:8088/v0`

const BETS_PER_USER_PER_MARKET = 4
const NUM_USERS = 4
// total bets will be: 4 markets x bets per user x num users
const ENABLE_LIMIT_ORDERS = true

if (require.main === module) {
  runScript(async ({ pg, firestore }) => {
    if (isProd()) {
      log('This script is not intended to run in production')
      process.exit(1)
    }
    const users = await getTestUsers(firestore, pg, NUM_USERS)
    const markets = await createTestMarkets(pg, users[0].apiKey)

    log('Created test markets and users')

    const binaryMarkets = [markets[0], markets[1]]
    const multiChoiceMarkets = [markets[2], markets[3]] as MultiContract[]

    const startTime = Date.now()
    let totalAttempts = 0
    let successfulBets = 0
    log('Placing bets on contracts ' + markets.map((m) => m.id).join(', '))

    let shouldQuit = 0
    process.on('SIGINT', () => {
      if (shouldQuit > 1) {
        log('Exiting early without final position comparison')
        process.exit(0)
      }
      shouldQuit++
      log(
        `Letting final bet pairs finish and doing position comparison. This may take a minute. If you don't want a position comparison, hit ctrl+c again to exit early.`
      )
    })
    const allBets: Bet[] = []
    const allSales: Bet[] = []

    const betWithRetry = async (f: () => Promise<any>) => {
      let attempts = 0
      while (true) {
        attempts++
        totalAttempts++
        try {
          const result = await f()
          successfulBets++
          return result
        } catch (error: any) {
          if (error.message.includes('Betting allowed only between 1-99%')) {
            log(`Skipping bet pair due to 1-99% limit`)
            return null
          }
          if (error.message.includes(`You don't have any`)) {
            log(`Skipping sale due to didn't have any`)
            return null
          }
          if (error.message.includes(`You can only sell up to`)) {
            log(`Skipping sale due to didn't have enough`)
            return null
          }
          log(`Bet failed (attempt ${attempts}): ${error.message}`)
          if (attempts % 5 === 1) {
            log(`Continuing to retry bet.`)
            if (shouldQuit > 0) {
              log('Exiting early from error, positions likely will not match')
              return null
            }
          }
          if (attempts > 20) {
            log(
              'Failed to place bet after 20 attempts, returning early, positions likely may not match'
            )
            return null
          }
        }
      }
    }

    for (const user of users) {
      if (shouldQuit > 0) break
      for (let i = 0; i < BETS_PER_USER_PER_MARKET; i++) {
        const binaryBet = getRandomTestBet(
          binaryMarkets[0],
          ENABLE_LIMIT_ORDERS,
          0.5
        )
        const binaryBetTwin = {
          ...binaryBet,
          contractId: binaryMarkets[1].id,
        }
        const multiChoiceBet = getRandomTestBet(
          multiChoiceMarkets[0],
          ENABLE_LIMIT_ORDERS,
          // Smaller to avoid betting must be between 1-99% error
          0.05
        )
        const answer = multiChoiceMarkets[0].answers.find(
          (a) => a.id === multiChoiceBet.answerId
        )
        const multiChoiceBetTwin = {
          ...multiChoiceBet,
          contractId: multiChoiceMarkets[1].id,
          answerId:
            multiChoiceMarkets[1].answers.find((a) => a.index === answer?.index)
              ?.id ?? 'error',
        }

        const betPairsPerMarket = [
          [
            { variant: DEFAULT_VARIANT, bet: binaryBet },
            { variant: TEST_VARIANT, bet: binaryBetTwin },
          ],
          [
            { variant: DEFAULT_VARIANT, bet: multiChoiceBet },
            { variant: TEST_VARIANT, bet: multiChoiceBetTwin },
          ],
        ]

        await Promise.all(
          betPairsPerMarket.map(async (bets) => {
            for (const { variant, bet } of bets) {
              const betPlaced = await betWithRetry(() =>
                placeTestBet(variant.getBetEndpoint(), bet, user.apiKey)
              )
              if (!betPlaced) break
              allBets.push(betPlaced)
            }
            for (const { variant, bet } of bets) {
              if (bet.limitProb == null) {
                const sale = {
                  contractId: bet.contractId,
                  shares: bet.amount / 10,
                  outcome: bet.outcome,
                  answerId: bet.answerId,
                }
                const salePlaced = await betWithRetry(() =>
                  placeTestSell(
                    variant.getSellEndpoint(bet.contractId),
                    sale,
                    user.apiKey
                  )
                )
                if (!salePlaced) break
                allSales.push(salePlaced)
              }
            }
            const contractIds = bets.map((b) => b.bet.contractId)
            const latestBets = allBets
              .filter((b) => contractIds.includes(b.contractId))
              .slice(-2)
            const bet1 = latestBets[0]
            const bet2 = latestBets[1]
            if (bet1.probAfter !== bet2.probAfter) {
              log(
                `Probabilities don't match: ${bet1.probAfter} vs ${bet2.probAfter} on contracts ${bet1.contractId} and ${bet2.contractId}`
              )
            }
            const latestSales = allSales
              .filter((b) => contractIds.includes(b.contractId))
              .slice(-2)
            const sale1 = latestSales[0]
            const sale2 = latestSales[1]
            if (sale1.probAfter !== sale2.probAfter) {
              log(
                `Probabilities don't match: ${sale1.probAfter} vs ${sale2.probAfter} on contracts ${sale1.contractId} and ${sale2.contractId}`
              )
            }
            if (successfulBets % 8 === 0) {
              const currentTime = Date.now()
              const elapsedTime = (currentTime - startTime) / 1000
              log(
                `In ${elapsedTime.toFixed(2)} seconds:
                  ${successfulBets} successful bets,
                  ${totalAttempts} total attempts`
              )
            }
          })
        )
      }
    }

    const endTime = Date.now()
    const totalBets = successfulBets
    const duration = (endTime - startTime) / 1000
    const betsPerSecond = totalBets / duration

    log(`Placed ${totalBets} bets in ${duration.toFixed(2)} seconds`)
    log(`Total attempts: ${totalAttempts}`)
    log(`Performance: ${betsPerSecond.toFixed(2)} bets per second`)
    log('Calculating final positions...')

    // wait second for final bets to settle
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const binaryPositionsMatch = await comparePositions(
      binaryMarkets[0],
      binaryMarkets[1]
    )
    const multiChoicePositionsMatch = await comparePositions(
      multiChoiceMarkets[0],
      multiChoiceMarkets[1]
    )

    log(`Binary market positions match: ${binaryPositionsMatch}`)
    log(`Multi-choice market positions match: ${multiChoicePositionsMatch}`)

    if (binaryPositionsMatch && multiChoicePositionsMatch) {
      log('All positions match between market pairs')
    } else {
      log('Position mismatch detected')
    }
  })
}

async function createTestMarkets(pg: SupabaseDirectClient, apiKey: string) {
  const binaryMarketProps = {
    outcomeType: 'BINARY',
    initialProb: 50,
  } as const

  const multiChoiceMarketProps = {
    outcomeType: 'MULTIPLE_CHOICE',
    answers: Array(50)
      .fill(0)
      .map((_, i) => 'answer ' + i),
    shouldAnswersSumToOne: true,
    addAnswersMode: 'DISABLED',
  } as const

  return await createMarkets(
    [
      {
        ...binaryMarketProps,
        question: 'binary test ' + Math.random().toString(36).substring(7),
      },
      {
        ...binaryMarketProps,
        question: 'binary test ' + Math.random().toString(36).substring(7),
      },
      {
        ...multiChoiceMarketProps,
        question:
          'multi-choice test ' + Math.random().toString(36).substring(7),
      },
      {
        ...multiChoiceMarketProps,
        question:
          'multi-choice test ' + Math.random().toString(36).substring(7),
      },
    ],
    apiKey,
    pg
  )
}

async function placeTestBet(
  endpoint: string,
  bet: ValidatedAPIParams<'bet'>,
  apiKey: string
) {
  const response = await fetch(`${API_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(bet),
  })
  const json = await response.json()
  if (!response.ok) {
    throw new APIError(response.status as any, json?.message, json?.details)
  }

  return json as Bet
}

async function placeTestSell(
  endpoint: string,
  sale: ValidatedAPIParams<'market/:contractId/sell'>,
  apiKey: string
) {
  const response = await fetch(`${API_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(sale),
  })
  const json = await response.json()
  if (!response.ok) {
    throw new APIError(response.status as any, json?.message, json?.details)
  }

  return json as Bet
}

const createMarkets = async (
  marketProps: ValidatedAPIParams<'market'>[],
  apiKey: string,
  pg: SupabaseDirectClient
) => {
  const markets = await Promise.all(
    marketProps.map(async (market) => {
      const resp = await fetch(API_URL + `/market`, {
        method: 'POST',
        headers: {
          Authorization: `Key ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(market),
      })
      if (resp.status !== 200) {
        console.error('Failed to create market', await resp.text())
      }
      return resp.json()
    })
  )
  return await pg.map(
    `select * from contracts where slug in ($1:list)`,
    [markets.map((m: any) => m.slug)],
    convertContract
  )
}

async function getMarketPositions(contractId: string) {
  const response = await fetch(`${API_URL}/market/${contractId}/positions`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  return (await response.json()) as ContractMetric[]
}

async function comparePositions(market1: Contract, market2: Contract) {
  const positions1 = await getMarketPositions(market1.id)
  const positions2 = await getMarketPositions(market2.id)

  const posMap1 = new Map(positions1.map((p) => [p.userId, p]))
  const posMap2 = new Map(positions2.map((p) => [p.userId, p]))

  for (const [userId, pos1] of posMap1) {
    const pos2 = posMap2.get(userId)
    if (!pos2) {
      log(`Position for user ${userId} not found in market ${market2.id}`)
      return false
    }
    const unequalShares = Object.keys(pos1.totalShares).filter(
      (key) => !floatingEqual(pos1.totalShares[key], pos2.totalShares[key])
    )
    if (unequalShares.length > 0) {
      unequalShares.forEach((key) => {
        log(
          `Unequal position for ${key} for user ${userId} in twin markets ${market1.id} and ${market2.id}`
        )
        log(`Market ${pos1.contractId}: ${pos1.totalShares[key]}`)
        log(`Market ${pos2.contractId}: ${pos2.totalShares[key]}`)
      })
    }
    if (!floatingEqual(pos1.invested, pos2.invested)) {
      log(
        `Unequal invested for user ${userId} in twin markets ${market1.id} and ${market2.id}`
      )
      log(`Market ${pos1.contractId}: invested: ${pos1.invested}`)
      log(`Market ${pos2.contractId}: invested: ${pos2.invested}`)
      return false
    }
  }

  return true
}
