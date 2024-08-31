import { runScript } from './run-script'
import { isProd, log } from 'shared/utils'
import { convertContract } from 'common/supabase/contracts'
import { Contract } from 'common/contract'
import { formatApiUrlWithParams } from 'common/util/api'
import { DEV_CONFIG } from 'common/envs/dev'
import { pgp } from 'shared/supabase/init'
import { getTestUsers } from 'shared/test/users'
import { getRandomTestBet } from 'shared/test/bets'

const URL = `https://${DEV_CONFIG.apiEndpoint}/v0`
// const URL = `http://localhost:8088/v0`
const USE_OLD_MARKET = true
const ENABLE_LIMIT_ORDERS = true

if (require.main === module) {
  runScript(async ({ pg, firestore }) => {
    if (isProd()) {
      log('This script is dangerous to run in prod. Exiting.')
      return
    }
    const privateUsers = await getTestUsers(firestore, pg, 100)
    const marketCreations = [
      {
        question: 'test ' + Math.random().toString(36).substring(7),
        outcomeType: 'MULTIPLE_CHOICE',
        answers: Array(50)
          .fill(0)
          .map((_, i) => 'answer ' + i),
        shouldAnswersSumToOne: true,
      },
      // {
      //   question: 'test ' + Math.random().toString(36).substring(7),
      //   outcomeType: 'BINARY',
      // },
      // {
      //   question: 'test ' + Math.random().toString(36).substring(7),
      //   outcomeType: 'MULTIPLE_CHOICE',
      //   answers: Array(50)
      //     .fill(0)
      //     .map((_, i) => 'answer ' + i),
      //   shouldAnswersSumToOne: false,
      // },
    ]
    log('creating markets')
    const markets = await Promise.all(
      marketCreations.map(async (market) => {
        const resp = await fetch(URL + `/market`, {
          method: 'POST',
          headers: {
            Authorization: `Key ${privateUsers[0].apiKey}`,
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
    const contracts = await pg.map(
      `select * from contracts where slug in ($1:list)`,
      USE_OLD_MARKET ? [['test-ubyxer']] : [markets.map((m: any) => m.slug)],
      convertContract
    )
    log(`Found ${contracts.length} contracts`)

    const totalVisits = 0
    let totalBets = 0
    const totalVisitErrors = 0
    let totalBetErrors = 0
    const startTime = Date.now()
    const userSpentAmounts: { [key: string]: number } = {}
    const errorMessage: { [key: string]: number } = {}

    const recentBetResults: { timestamp: number; success: boolean }[] = []

    const runChaos = async () => {
      log('Chaos reigns...')
      await Promise.all(
        privateUsers.map(async (user) => {
          const manyBetsPromise = async () => {
            const betCount = Math.floor(Math.random() * 10) + 1
            const contract =
              contracts[Math.floor(Math.random() * contracts.length)]
            const betResult = await placeManyBets(
              user.apiKey!,
              betCount,
              contract
            )
            totalBets += betResult.success
            totalBetErrors += betResult.failure
            userSpentAmounts[user.id] =
              (userSpentAmounts[user.id] || 0) + betResult.totalSpent
            Object.entries(betResult.errorMessage).map(([key, value]) => {
              errorMessage[key] = errorMessage[key]
                ? errorMessage[key] + value
                : value
            })

            // Add bet results to recentBetResults
            const now = Date.now()
            for (let i = 0; i < betResult.success; i++) {
              recentBetResults.push({ timestamp: now, success: true })
            }
            for (let i = 0; i < betResult.failure; i++) {
              recentBetResults.push({ timestamp: now, success: false })
            }

            // Remove bet results older than 60 seconds
            const sixtySecondsAgo = now - 60000
            while (
              recentBetResults.length > 0 &&
              recentBetResults[0].timestamp < sixtySecondsAgo
            ) {
              recentBetResults.shift()
            }
            // 50 visits per user
            // const visitPromises = Array(50)
            //   .fill(null)
            //   .map(() => async () => {
            //     const contract =
            //       contracts[Math.floor(Math.random() * contracts.length)]
            //     try {
            //       await visitContract(contract)
            //       totalVisits++
            //     } catch (error: any) {
            //       errorMessage[error.message] = errorMessage[error.message]
            //         ? errorMessage[error.message] + 1
            //         : 1
            //       totalVisitErrors++
            //     }
            //   })
          }

          await Promise.all([
            // ...visitPromises.map((p) => p()),
            manyBetsPromise(),
          ])
        })
      )
    }

    const reportStats = () => {
      const elapsedSeconds = (Date.now() - startTime) / 1000
      log(`----- Stats report -----`)
      log(`----- Errors follow -----`)
      Object.entries(errorMessage).map(([key, value]) => {
        log(`Error seen ${value} times: ${key}`)
      })
      log(`----- End of errors -----`)
      log(`----- VISITS -----`)
      log(`Total error visits: ${totalVisitErrors}`)
      log(`Total successful visits: ${totalVisits}`)
      log(
        `Successful visits per second: ${(totalVisits / elapsedSeconds).toFixed(
          2
        )}`
      )
      log(
        'Successful visit rate: ',
        Math.round((totalVisits / (totalVisits + totalVisitErrors)) * 100) + '%'
      )
      log(`----- BETS -----`)
      log(`Total error bets: ${totalBetErrors}`)
      log(`Total successful bets: ${totalBets}`)
      log(
        `Successful bets per second: ${(totalBets / elapsedSeconds).toFixed(2)}`
      )
      const totalRecentBets = recentBetResults.length
      const successfulRecentBets = recentBetResults.filter(
        (r) => r.success
      ).length
      const recentSuccessRate =
        totalRecentBets > 0 ? (successfulRecentBets / 60).toFixed(2) : '0'
      log(
        `Successful bets per second over the last minute: ${recentSuccessRate}`
      )
      log(
        'Successful bet rate: ',
        Math.round((totalBets / (totalBets + totalBetErrors)) * 100) + '%'
      )

      log(`----- FINALLY -----`)
      log(`Total time elapsed: ${elapsedSeconds.toFixed(2)} seconds`)
      log(`-------------------------`)
    }

    // Run report stats and repeat chaos
    const reportInterval = setInterval(reportStats, 5000)
    const chaosInterval = setInterval(runChaos, 10000)

    // Handle script termination
    process.on('SIGINT', async () => {
      clearInterval(chaosInterval)
      clearInterval(reportInterval)
      reportStats()
      pgp.end()
      log('Chaos no longer reigns.')
      process.exit()
    })

    // Run chaos for the first time
    await runChaos()
    // Keep the script running
    await new Promise(() => {})
  })
}

async function visitContract(contract: Contract) {
  return fetch(formatApiUrlWithParams('market', { contractId: contract.id }), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

async function placeManyBets(
  apiKey: string,
  count: number,
  contract: Contract
) {
  const betData = getRandomTestBet(contract, ENABLE_LIMIT_ORDERS)
  let success = 0
  let failure = 0
  let totalSpent = 0
  const executionTimes: number[] = []

  const errorMessage: { [key: string]: number } = {}
  for (let i = 0; i < count; i++) {
    const start = Date.now()
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 2000))
    await fetch(URL + '/bet', {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(betData),
    })
      .then(async (resp) => {
        const end = Date.now()
        executionTimes.push(end - start)
        const json = await resp.json()
        if (resp.status === 200) {
          success++
          totalSpent += betData.amount
        } else {
          errorMessage[json.message] = errorMessage[json.message]
            ? errorMessage[json.message] + 1
            : 1
          failure++
        }
      })
      .catch((e) => {
        const end = Date.now()
        executionTimes.push(end - start)
        errorMessage[e.message] = errorMessage[e.message]
          ? errorMessage[e.message] + 1
          : 1
        failure++
      })
  }

  return { success, failure, errorMessage, totalSpent, executionTimes }
}
