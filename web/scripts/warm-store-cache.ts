#!/usr/bin/env bun
import 'dotenv/config'

const base = process.env.NEXT_PUBLIC_CODEBUFF_APP_URL || 'http://localhost:3000'
const url = `${base}/api/agents`

async function main() {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Codebuff-Warm-Store-Cache',
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      console.error(`Warm cache failed: ${res.status} ${res.statusText}`)
      process.exitCode = 0 // do not fail pipeline
      return
    }

    const data = (await res.json()) as unknown[]
    console.log(
      `Warm cache succeeded: fetched ${Array.isArray(data) ? data.length : 0} agents from ${url}`,
    )
  } catch (err) {
    console.error(`Warm cache error: ${(err as Error).message}`)
    // Do not fail build/postbuild step
    process.exitCode = 0
  }
}

await main()

