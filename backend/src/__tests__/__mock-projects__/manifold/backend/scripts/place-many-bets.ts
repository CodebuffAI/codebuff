import { initAdmin } from 'shared/init-admin'
import { DEV_CONFIG } from 'common/envs/dev'

async function placeManyBets(apiKey: string, count: number) {
  const url = `https://${DEV_CONFIG.apiEndpoint}/v0/bet` //'https://placebet-w3txbmd3ba-uc.a.run.app'
  // const url = `http://localhost:8088/v0/bet` //'https://placebet-w3txbmd3ba-uc.a.run.app'

  const apiKey2 = 'ad55b4c6-794a-4eef-94dc-d80a7438319d' // Manifold Markets
  const betData = {
    contractId: 'pdcWgwpzV4RsJjQGVq9v', // https://dev.manifold.markets/IanPhilips/beeeep-bop
    amount: 1,
    outcome: Math.random() > 0.5 ? 'YES' : 'NO',
  }
  const betData2 = {
    contractId: 'Y9C5Hb9yS8D3C3KRwRYC', // https://dev.manifold.markets/DavidChee/will-sirsalty-hit-infinity-by-this
    amount: 1,
    outcome: Math.random() > 0.5 ? 'YES' : 'NO',
  }
  let success = 0
  let failure = 0
  const promises = []
  const start = Date.now()
  console.log(
    `Placing ${count} bets  at ${url} on contracts ${betData.contractId} and ${betData2.contractId}.`
  )
  const errorMessage: { [key: string]: number } = {}
  for (let i = 0; i < count; i++) {
    const chosenBet = Math.random() > 0.5 ? betData : betData2
    const chosenAPIKey = Math.random() > 0.5 ? apiKey : apiKey2
    const resp = fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Key ${chosenAPIKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chosenBet),
    })
      .then(async (resp) => {
        const json = await resp.json()
        if (resp.status === 200) {
          console.log('Success')
          success++
        } else {
          errorMessage[json.message] = errorMessage[json.message]
            ? errorMessage[json.message] + 1
            : 1
          failure++
          console.log('Error code', json)
        }
      })
      .catch((e) => {
        console.log('Error:', e)
        failure++
      })
    promises.push(resp)
  }
  await Promise.all(promises)
  const end = Date.now()
  Object.entries(errorMessage).map(([key, value]) => {
    console.log(`Error seen: ${key} (${value} times)`)
  })
  console.log(
    `Tried placing ${count} bets: Success: ${success}, Failure: ${failure} in ${
      end - start
    }ms`
  )
}

if (require.main === module) {
  initAdmin()
  const args = process.argv.slice(2)
  if (args.length != 2) {
    console.log('Usage: place-many-bets [apikey] [number-of-bets-to-place]')
  } else {
    placeManyBets(args[0], parseInt(args[1])).catch((e) => console.error(e))
  }
}
