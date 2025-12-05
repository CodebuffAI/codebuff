/**
 * Example: Code Reviewer
 *
 * A simple script that submits code for AI review.
 * Run with: bun run sdk/e2e/examples/code-reviewer.example.ts
 */

import { CodebuffClient } from '../../src/client'

const SAMPLE_CODE = `
function divide(a, b) {
  return a / b; // Bug: no check for division by zero
}
`.trim()

async function main() {
  const apiKey = process.env.CODEBUFF_API_KEY
  if (!apiKey) {
    console.error('CODEBUFF_API_KEY environment variable is required')
    process.exit(1)
  }

  const client = new CodebuffClient({ apiKey })

  console.log('🔍 Reviewing code...\n')
  console.log('Code to review:')
  console.log('```')
  console.log(SAMPLE_CODE)
  console.log('```\n')

  const result = await client.run({
    agent: 'base',
    prompt: `Review this code and identify any bugs or issues:\n\n${SAMPLE_CODE}`,
    handleStreamChunk: (chunk) => {
      if (typeof chunk === 'string') {
        process.stdout.write(chunk)
      }
    },
  })

  console.log('\n')

  if (result.output.type === 'error') {
    console.error('Error:', result.output.message)
    process.exit(1)
  }

  console.log('✅ Review complete!')
}

main().catch(console.error)
