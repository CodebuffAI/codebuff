import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { sql } from 'drizzle-orm'

async function analyzeModelUsage(): Promise<void> {
  console.log('Analyzing model usage across messages...\n')

  try {
    // First get the 10k most recent messages directly
    const modelCounts = await db
      .select({
        model: schema.message.model,
        count: sql<string>`COUNT(*)`,
        total_input_tokens: sql<string>`SUM(${schema.message.input_tokens})`,
        total_output_tokens: sql<string>`SUM(${schema.message.output_tokens})`,
        total_cost: sql<string>`SUM(${schema.message.cost})`,
        total_credits: sql<string>`SUM(${schema.message.credits})`,
      })
      .from(schema.message)
      .where(
        sql`${schema.message.id} IN (
        SELECT id FROM ${schema.message}
        ORDER BY finished_at DESC
        LIMIT 10000
      )`
      )
      .groupBy(schema.message.model)
      .orderBy(sql`COUNT(*) DESC`)

    const totalMessages = 10000

    console.log('Model Usage Statistics (Last 10k messages)\n')
    console.log('----------------------------------------')

    for (const stat of modelCounts) {
      const count = parseInt(stat.count)
      const percentage = ((count / totalMessages) * 100).toFixed(1)
      const avgInputTokens = (
        parseInt(stat.total_input_tokens) / count
      ).toFixed(1)
      const avgOutputTokens = (
        parseInt(stat.total_output_tokens) / count
      ).toFixed(1)
      const avgCost = (parseFloat(stat.total_cost) / count).toFixed(4)
      const avgCredits = (parseInt(stat.total_credits) / count).toFixed(1)

      console.log(`\nModel: ${stat.model}`)
      console.log(`Count: ${count} (${percentage}% of messages)`)
      console.log(`Average Input Tokens: ${avgInputTokens}`)
      console.log(`Average Output Tokens: ${avgOutputTokens}`)
      console.log(`Average Cost: $${avgCost}`)
      console.log(`Average Credits: ${avgCredits}`)
    }
  } catch (error) {
    console.error('Error analyzing model usage:', error)
  }
}

// Run the script
analyzeModelUsage()
