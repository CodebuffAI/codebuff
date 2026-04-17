/**
 * Queries the BigQuery `message` table for the most recent rows and prints
 * cost, upstream_inference_cost, token breakdown, and model.
 *
 * Used to investigate whether OpenRouter is populating BOTH `usage.cost` and
 * `usage.cost_details.upstream_inference_cost` for non-BYOK requests, which
 * would cause `web/src/llm-api/openrouter.ts#extractUsageAndCost` to double-
 * count (that function returns `openRouterCost + upstreamCost`).
 *
 * Usage:
 *   bun run scripts/query-message-costs.ts              # dev dataset
 *   bun run scripts/query-message-costs.ts --prod       # prod dataset
 *   bun run scripts/query-message-costs.ts --prod --limit 200
 *   bun run scripts/query-message-costs.ts --prod --model anthropic/claude-opus-4.7
 *
 * Note: `model` is NOT a top-level column in the BigQuery `message` schema;
 * it lives inside the `request` JSON blob, so we extract it with
 * JSON_EXTRACT_SCALAR.
 */

import { BigQuery } from '@google-cloud/bigquery'

type Args = {
  isProd: boolean
  limit: number
  modelFilter: string | null
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const isProd = argv.includes('--prod')

  const limitIdx = argv.indexOf('--limit')
  const limit =
    limitIdx >= 0 && argv[limitIdx + 1] ? parseInt(argv[limitIdx + 1], 10) : 100

  const modelIdx = argv.indexOf('--model')
  const modelFilter =
    modelIdx >= 0 && argv[modelIdx + 1] ? argv[modelIdx + 1] : null

  return { isProd, limit, modelFilter }
}

function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '-'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function fmtCost(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '-'
  return `$${n.toFixed(6)}`
}

// Anthropic Opus 4.6 / 4.7 per-1M-token pricing.
// Used for a quick "expected cost" sanity column on Opus rows only.
const OPUS_INPUT_PER_M = 5.0
const OPUS_CACHE_READ_PER_M = 0.5
const OPUS_OUTPUT_PER_M = 25.0

function expectedOpusCost(row: {
  input_tokens: number
  cache_read_input_tokens: number
  output_tokens: number
}): number {
  const uncachedInput = Math.max(
    0,
    (row.input_tokens ?? 0) - (row.cache_read_input_tokens ?? 0),
  )
  return (
    (uncachedInput * OPUS_INPUT_PER_M) / 1_000_000 +
    ((row.cache_read_input_tokens ?? 0) * OPUS_CACHE_READ_PER_M) / 1_000_000 +
    ((row.output_tokens ?? 0) * OPUS_OUTPUT_PER_M) / 1_000_000
  )
}

async function main() {
  const { isProd, limit, modelFilter } = parseArgs()
  const dataset = isProd ? 'codebuff_data' : 'codebuff_data_dev'
  const table = `${dataset}.message`

  console.log(
    `Querying last ${limit} rows from \`${table}\`${
      modelFilter ? ` (model = ${modelFilter})` : ''
    }`,
  )
  console.log('')

  const client = new BigQuery()

  // Model isn't a column — pull from request JSON.
  // Cache creation tokens also not in schema (OpenRouter path is always 0 there).
  const query = `
    SELECT
      id,
      finished_at,
      JSON_EXTRACT_SCALAR(request, '$.model') AS model,
      input_tokens,
      cache_read_input_tokens,
      output_tokens,
      cost,
      upstream_inference_cost,
      -- cache_creation_input_tokens lives in BigQuery too; null-safe cast
      SAFE_CAST(JSON_EXTRACT_SCALAR(request, '$.usage') AS STRING) AS request_usage_raw
    FROM \`${table}\`
    WHERE TRUE
    ${
      modelFilter
        ? `AND JSON_EXTRACT_SCALAR(request, '$.model') = @modelFilter`
        : ''
    }
    AND JSON_EXTRACT_SCALAR(request, '$.model') LIKE '%opus%'
    AND cost BETWEEN 0.10 AND 0.25
    ORDER BY finished_at DESC
    LIMIT @limit
  `

  const [rows] = await client.query({
    query,
    params: {
      limit,
      ...(modelFilter ? { modelFilter } : {}),
    },
  })

  if (rows.length === 0) {
    console.log('No rows found.')
    return
  }

  // Per-row table. `ups/cost` ≈ 1.0 on a row means upstream equals the billed
  // cost on that row — the classic signature of a double-count.
  const header = [
    'finished_at',
    'model',
    'input',
    'cache_read',
    'uncached_in',
    'output',
    'cost',
    'upstream',
    'cost+ups',
    'ups/cost',
    'expected_opus',
  ]
  console.log(header.join('\t'))

  let doubleCountHits = 0
  let upstreamPopulatedCount = 0
  let totalCost = 0
  let totalUpstream = 0
  let opusCostSum = 0
  let opusExpectedSum = 0

  for (const row of rows) {
    const input = Number(row.input_tokens ?? 0)
    const cacheRead = Number(row.cache_read_input_tokens ?? 0)
    const output = Number(row.output_tokens ?? 0)
    const uncachedIn = Math.max(0, input - cacheRead)
    const cost = row.cost === null || row.cost === undefined ? null : Number(row.cost)
    const upstream =
      row.upstream_inference_cost === null ||
      row.upstream_inference_cost === undefined
        ? null
        : Number(row.upstream_inference_cost)
    const sum = (cost ?? 0) + (upstream ?? 0)
    const ratio =
      cost && upstream !== null && cost > 0 ? upstream / cost : null

    const finished =
      row.finished_at?.value ?? row.finished_at?.toString() ?? String(row.finished_at)

    const model = row.model ?? '-'
    const isOpus = typeof model === 'string' && model.includes('opus')

    const expected = expectedOpusCost({
      input_tokens: input,
      cache_read_input_tokens: cacheRead,
      output_tokens: output,
    })

    console.log(
      [
        String(finished).slice(0, 19),
        model,
        fmtNum(input),
        fmtNum(cacheRead),
        fmtNum(uncachedIn),
        fmtNum(output),
        fmtCost(cost),
        fmtCost(upstream),
        fmtCost(sum),
        ratio !== null ? ratio.toFixed(2) : '-',
        isOpus ? fmtCost(expected) : '-',
      ].join('\t'),
    )

    if (upstream !== null && upstream > 0) {
      upstreamPopulatedCount++
      totalUpstream += upstream
    }
    if (cost !== null) totalCost += cost

    if (isOpus) {
      if (cost !== null) opusCostSum += cost
      opusExpectedSum += expected
    }

    // Heuristic: flag rows where upstream+cost > 1.5x cost alone (likely double-count)
    if (cost !== null && upstream !== null && upstream > 0.5 * cost) {
      doubleCountHits++
    }
  }

  console.log('')
  console.log('─────────────── Summary ───────────────')
  console.log(`Total rows:                      ${rows.length}`)
  console.log(
    `Rows with non-zero upstream:     ${upstreamPopulatedCount} / ${rows.length}`,
  )
  console.log(`Σ cost (billed):                 ${fmtCost(totalCost)}`)
  console.log(`Σ upstream_inference_cost:       ${fmtCost(totalUpstream)}`)
  console.log(`Σ cost + upstream:               ${fmtCost(totalCost + totalUpstream)}`)

  if (opusExpectedSum > 0) {
    console.log('')
    console.log('─── Opus-only comparison ───')
    console.log(`Σ actual cost (opus rows):       ${fmtCost(opusCostSum)}`)
    console.log(`Σ expected (Opus 4.6/4.7 list):  ${fmtCost(opusExpectedSum)}`)
    console.log(
      `Actual / expected ratio:         ${(opusCostSum / opusExpectedSum).toFixed(
        2,
      )}x`,
    )
    console.log(
      '  (If ≈2.0x → double-count confirmed. If ≈1.0x → cost is accurate.)',
    )
  }

  console.log('')
  console.log(
    `Rows flagged as likely double-count (upstream > 0.5 × cost): ${doubleCountHits}`,
  )
  console.log('')
  console.log(
    'Hypothesis check: in web/src/llm-api/openrouter.ts#extractUsageAndCost,',
  )
  console.log(
    'we do `cost = openRouterCost + upstreamCost`. If upstream is routinely',
  )
  console.log(
    'populated (not 0/null) for non-BYOK rows, that addition double-counts.',
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err)
    process.exit(1)
  })
