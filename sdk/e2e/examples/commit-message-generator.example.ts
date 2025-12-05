/**
 * Example: Commit Message Generator
 *
 * Generates commit messages from diffs.
 * Run with: bun run sdk/e2e/examples/commit-message-generator.example.ts
 */

import { CodebuffClient } from '../../src/client'

const SAMPLE_DIFF = `
diff --git a/src/utils.ts b/src/utils.ts
index 1234567..abcdefg 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,5 +1,6 @@
 export function greet(name: string): string {
-  return \`Hello, \${name}!\`;
+  const greeting = \`Hello, \${name}!\`;
+  console.log(greeting);
+  return greeting;
 }
`.trim()

async function main() {
  const apiKey = process.env.CODEBUFF_API_KEY
  if (!apiKey) {
    console.error('CODEBUFF_API_KEY environment variable is required')
    process.exit(1)
  }

  const client = new CodebuffClient({ apiKey })

  console.log('📝 Generating commit message...\n')
  console.log('Diff:')
  console.log('```')
  console.log(SAMPLE_DIFF)
  console.log('```\n')
  console.log('Generated commit message:\n')

  const result = await client.run({
    agent: 'base',
    prompt: `Generate a concise git commit message for this diff:\n\n${SAMPLE_DIFF}`,
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
