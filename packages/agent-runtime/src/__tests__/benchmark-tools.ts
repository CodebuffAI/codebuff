import { handleReadOutline } from '../tools/handlers/tool/read-outline'
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

  // Print results table
  console.log('| Metric / Tool | read_files (Full Read) | read_outline |')
  console.log('|---|---|---|')
  console.log(
    `| **Latency (ms)** | ${readFilesLatency.toFixed(2)}ms | ${outlineLatency.toFixed(2)}ms |`,
  )
  console.log(
    `| **Size (Characters)** | ${readFilesChars} chars | ${outlineChars} chars |`,
  )

  const outlineSavings = ((1 - outlineChars / readFilesChars) * 100).toFixed(1)
  console.log(
    `| **Token Savings (%)** | Baseline | **${outlineSavings}% reduction** |\n`,
  )

  console.log(
    `==================================================================`,
  )
  console.log(`💡 INSIGHTS:`)
  console.log(
    `- **read_outline** reduces the token overhead by **${outlineSavings}%**, mapping out imports, classes, and methods instantly.`,
  )
  console.log(
    `==================================================================`,
  )
}

runBenchmark().catch(console.error)
