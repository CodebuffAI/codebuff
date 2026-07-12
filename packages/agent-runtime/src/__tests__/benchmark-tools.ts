import { handleReadOutline } from '../tools/handlers/tool/read-outline'
import { handleReadSlices } from '../tools/handlers/tool/read-slices'
import { existsSync, readFileSync } from 'fs'

async function runBenchmark() {
  const targetPath = 'sdk/src/provider-config.ts'
  if (!existsSync(targetPath)) {
    console.error(
      `Error: target path ${targetPath} does not exist. Run from project root.`,
    )
    process.exit(1)
  }

  console.log(
    `==================================================================`,
  )
  console.log(`🚀 CODEBUFF TOOL PERFORMANCE BENCHMARK`)
  console.log(`Target File: ${targetPath}`)
  console.log(
    `==================================================================\n`,
  )

  // 1. Benchmark read_files (Full File Read)
  const t0_read = performance.now()
  const fullContent = readFileSync(targetPath, 'utf8')
  const t1_read = performance.now()
  const readFilesLatency = t1_read - t0_read
  const readFilesChars = fullContent.length

  // 2. Benchmark read_outline
  const mockParamsOutline = {
    previousToolCallFinished: Promise.resolve(),
    toolCall: {
      input: {
        path: targetPath,
      },
    },
    requestOptionalFile: async () => fullContent,
  }
  const t0_outline = performance.now()
  const { output: outlineOutput } = await handleReadOutline(
    mockParamsOutline as any,
  )
  const t1_outline = performance.now()
  const outlineLatency = t1_outline - t0_outline
  const outlineResult = outlineOutput[0].value.outline
  const outlineChars = outlineResult.length

  // 3. Benchmark read_slices
  const targetSymbols = ['resolveConfigFragmentPath', 'loadProviderConfigSync']
  const mockParamsSlices = {
    previousToolCallFinished: Promise.resolve(),
    toolCall: {
      input: {
        path: targetPath,
        symbols: targetSymbols,
      },
    },
    requestOptionalFile: async () => fullContent,
  }
  const t0_slices = performance.now()
  const { output: slicesOutput } = await handleReadSlices(
    mockParamsSlices as any,
  )
  const t1_slices = performance.now()
  const slicesLatency = t1_slices - t0_slices
  const slicesResult = JSON.stringify(slicesOutput[0].value.slices)
  const slicesChars = slicesResult.length

  // Print results table
  console.log(
    '| Metric / Tool | read_files (Full Read) | read_outline | read_slices (2 Symbols) |',
  )
  console.log('|---|---|---|---|')
  console.log(
    `| **Latency (ms)** | ${readFilesLatency.toFixed(2)}ms | ${outlineLatency.toFixed(2)}ms | ${slicesLatency.toFixed(2)}ms |`,
  )
  console.log(
    `| **Size (Characters)** | ${readFilesChars} chars | ${outlineChars} chars | ${slicesChars} chars |`,
  )

  const outlineSavings = ((1 - outlineChars / readFilesChars) * 100).toFixed(1)
  const slicesSavings = ((1 - slicesChars / readFilesChars) * 100).toFixed(1)
  console.log(
    `| **Token Savings (%)** | Baseline | **${outlineSavings}% reduction** | **${slicesSavings}% reduction** |\n`,
  )

  console.log(
    `==================================================================`,
  )
  console.log(`💡 INSIGHTS:`)
  console.log(
    `- **read_outline** reduces the token overhead by **${outlineSavings}%**, mapping out imports, classes, and methods instantly.`,
  )
  console.log(
    `- **read_slices** reduces token overhead by **${slicesSavings}%**, retrieving exactly the lines for: ${targetSymbols.join(', ')}.`,
  )
  console.log(
    `==================================================================`,
  )
}

runBenchmark().catch(console.error)
