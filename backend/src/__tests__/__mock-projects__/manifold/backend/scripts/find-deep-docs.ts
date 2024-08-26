import { runScript } from './run-script'

import { log, processPartitioned } from 'shared/utils'

type DeepContractResult = {
  data: any
  depth: number
}

function maxDepth(obj: unknown) {
  if (obj == null || typeof obj !== 'object') {
    return 0
  }
  let result = 0
  for (const [_key, val] of Object.entries(obj)) {
    const depth = maxDepth(val) + 1
    if (depth > result) {
      result = depth
    }
  }
  return result
}

if (require.main === module) {
  runScript(async ({ firestore }) => {
    log('Searching for deep contract objects...')
    const results = [] as DeepContractResult[]
    const source = firestore.collectionGroup('contracts')
    await processPartitioned(source, 100, async (docs) => {
      for (const doc of docs) {
        const data = doc.data()
        try {
          const depth = maxDepth(data)
          if (depth >= 20) {
            results.push({ data, depth })
          }
        } catch (e) {
          console.error(e)
          console.log(data)
        }
      }
    })
    for (const result of results) {
      console.log(result.data?.id, result.depth)
    }
    console.log(results.length)
  })
}
