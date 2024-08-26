import { runScript } from 'run-script'

if (require.main === module) {
  runScript(async () => {
    const apiKey = 'ba9481c4-0ed0-45e3-8857-4bab9ba76d15'
    const contractId = '07xjPBsA6xA8qlZ8EDQX'
    const resolveUrl = `http://localhost:8088/v0/market/${contractId}/resolve`
    const unResolveUrl = `http://localhost:8088/unresolve`

    const promises = []
    for (let i = 0; i < 10; i++) {
      promises.push(
        apiRequest(apiKey, resolveUrl, 'POST', {
          contractId,
          outcome: 'YES',
        })
      )
      promises.push(
        apiRequest(apiKey, unResolveUrl, 'POST', {
          contractId,
        })
      )
    }
    await Promise.all(promises)
  })
}

const apiRequest = async (
  apiKey: string,
  url: string,
  method: 'GET' | 'POST',
  body: any
) => {
  return await fetch(url, {
    method,
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
    .then(async (resp) => {
      const json = await resp.json()
      console.log('Response', json)
      return json
    })
    .catch((e) => {
      console.log('Error:', e)
      return e
    })
}
