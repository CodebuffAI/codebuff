import { eq, desc } from 'drizzle-orm'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { fileRegex } from 'common/util/file'
import fs from 'fs'
import path from 'path'
import { shuffle } from 'lodash'

interface EditBlock {
  filePath: string
  content: string
}

async function analyzeEditBlocks() {
  const messagesSorted = await db
    .select({
      response: schema.message.response,
    })
    .from(schema.message)
    .where(eq(schema.message.model, 'claude-3-5-sonnet-20241022'))
    .orderBy(desc(schema.message.finished_at))
    .limit(10000)

  const messages = shuffle(messagesSorted).slice(0, 1000)
  const editBlocks: EditBlock[] = []

  for (const message of messages) {
    const response = (message.response as any).toString()
    let match

    // Reset regex state for each message
    fileRegex.lastIndex = 0

    while ((match = fileRegex.exec(response)) !== null) {
      const [, filePath, content] = match
      // Only include blocks that contain search/replace markers
      if (content.includes('<<<<<<< SEARCH')) {
        editBlocks.push({
          filePath,
          content: content.startsWith('\n') ? content.slice(1) : content,
        })
      }
    }
  }

  // Write edit blocks to JSON file
  const outputPath = path.join(__dirname, 'edit-blocks.json')
  fs.writeFileSync(outputPath, JSON.stringify(editBlocks, null, 2))

  console.log(`Found ${editBlocks.length} edit blocks`)
  console.log('\nFiles modified:')
  const fileFrequency = new Map<string, number>()
  for (const block of editBlocks) {
    fileFrequency.set(
      block.filePath,
      (fileFrequency.get(block.filePath) || 0) + 1
    )
  }

  // Sort by frequency
  const sortedFiles = Array.from(fileFrequency.entries()).sort(
    (a, b) => b[1] - a[1]
  )

  for (const [file, count] of sortedFiles) {
    console.log(`${file}: ${count} edits`)
  }
}

analyzeEditBlocks().catch(console.error)
