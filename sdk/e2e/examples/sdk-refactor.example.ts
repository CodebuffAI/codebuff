/**
 * Example: SDK Refactor
 *
 * Refactors code based on instructions.
 * Run with: bun run sdk/e2e/examples/sdk-refactor.example.ts
 */

import { CodebuffClient } from '../../src/client'

const CODE_TO_REFACTOR = `
function processData(data) {
  let result = [];
  for (let i = 0; i < data.length; i++) {
    if (data[i].active === true) {
      result.push({
        id: data[i].id,
        name: data[i].name.toUpperCase(),
        score: data[i].score * 2
      });
    }
  }
  return result;
}
`.trim()

async function main() {
  const apiKey = process.env.CODEBUFF_API_KEY
  if (!apiKey) {
    console.error('CODEBUFF_API_KEY environment variable is required')
    process.exit(1)
  }

  const client = new CodebuffClient({ apiKey })

  console.log('🔧 Refactoring code...\n')
  console.log('Original code:')
  console.log('```')
  console.log(CODE_TO_REFACTOR)
  console.log('```\n')
  console.log('Refactored version:\n')

  const result = await client.run({
    agent: 'base',
    prompt: `Refactor this code to be more readable and use modern JavaScript features:\n\n${CODE_TO_REFACTOR}`,
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

  console.log('✅ Refactoring complete!')
}

main().catch(console.error)
