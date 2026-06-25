/**
 * E2E smoke test for chat thread title generation (src/server/chat/title.ts).
 *
 * Confirms the title agent returns a short, clean, sensitive-info-free title
 * for both the full-access (minimax-m3) and limited (deepseek-v4-flash) models.
 *
 * Run from freebuff/web with env loaded:
 *   sh -c 'set -a; source ../../.env.local; set +a; \
 *     bun scripts/test-chat-title.ts'
 */
import { generateThreadTitle } from '../src/server/chat/title'

const prompts = [
  'How do I set up a Postgres connection pool in Next.js with Drizzle?',
  "Hi! My name is Jane Doe, my email is jane.doe@example.com and my API key is sk-live-abc123. Can you help me debug why my Stripe webhook returns 400?",
  'whats the weather like, just saying hi',
  'Write a Python script to scrape product prices from a list of URLs and export to CSV',
]

// full-access → minimax-m3, limited → deepseek-v4-flash
const models = ['minimax-m3', 'deepseek-v4-flash']

const controller = new AbortController()

for (const model of models) {
  console.log(`\n==================== model: ${model} ====================`)
  for (const prompt of prompts) {
    const start = Date.now()
    const title = await generateThreadTitle({
      prompt,
      model,
      userId: 'test-user',
      threadId: 'test-thread',
      signal: controller.signal,
    })
    const ms = Date.now() - start
    console.log('\n────────────────────────────────────')
    console.log('PROMPT:', prompt)
    console.log(`TITLE (${ms}ms):`, JSON.stringify(title))
  }
}

process.exit(0)
