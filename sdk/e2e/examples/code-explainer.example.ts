/**
 * Example: Code Explainer
 *
 * Explains what code does in plain English.
 * Run with: bun run sdk/e2e/examples/code-explainer.example.ts
 */

import { CodebuffClient } from '../../src/client'

const SAMPLE_CODE = `
async function fetchUserData(userId: string): Promise<User | null> {
  try {
    const response = await fetch(\`/api/users/\${userId}\`);
    if (!response.ok) {
      throw new Error(\`HTTP error! status: \${response.status}\`);
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch user:', error);
    return null;
  }
}
`.trim()

async function main() {
  const apiKey = process.env.CODEBUFF_API_KEY
  if (!apiKey) {
    console.error('CODEBUFF_API_KEY environment variable is required')
    process.exit(1)
  }

  const client = new CodebuffClient({ apiKey })

  console.log('📖 Explaining code...\n')
  console.log('Code to explain:')
  console.log('```')
  console.log(SAMPLE_CODE)
  console.log('```\n')
  console.log('Explanation:\n')

  const result = await client.run({
    agent: 'base',
    prompt: `Explain what this code does in simple terms:\n\n${SAMPLE_CODE}`,
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

  console.log('✅ Done!')
}

main().catch(console.error)
