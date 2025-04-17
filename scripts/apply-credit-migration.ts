import db from '../common/src/db/index'
import fs from 'fs'
import * as schema from '../common/src/db/schema'

async function applyCreditMigration() {
  try {
    const migrationData: any[] = JSON.parse(
      fs.readFileSync('credit-migration-data.json', 'utf-8')
    )

    console.log(
      `Starting credit migration for ${migrationData.length} users...`
    )

    // Progress‑tracking file — just an array of operation_ids
    const progressPath = 'credit-migration-progress.json'
    let processedIds: Set<string> = new Set()
    if (fs.existsSync(progressPath)) {
      processedIds = new Set(JSON.parse(fs.readFileSync(progressPath, 'utf-8')))
    }

    for (const userData of migrationData) {
      const { userId, entries } = userData

      let newIdsWritten = false

      for (const entry of entries) {
        if (processedIds.has(entry.operation_id)) continue // already done

        await db.insert(schema.creditLedger).values({
          operation_id: entry.operation_id,
          user_id: entry.user_id,
          principal: entry.principal,
          balance: entry.balance,
          type: entry.type,
          description: entry.description,
          priority: entry.priority,
          expires_at: new Date(entry.expires_at),
        })

        processedIds.add(entry.operation_id)
        newIdsWritten = true
      }

      if (newIdsWritten) {
        fs.writeFileSync(
          progressPath,
          JSON.stringify(Array.from(processedIds), null, 2)
        )
        console.log(`Processed credits for user ${userId}`)
      } else {
        console.log(`Skipped user ${userId} — all entries already migrated`)
      }
    }

    console.log('Credit migration completed successfully!')
  } catch (error) {
    console.error('Error applying credit migration:', error)
    throw error
  }
}

applyCreditMigration()
