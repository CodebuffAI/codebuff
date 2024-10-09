// @ts-ignore
import { env } from './env.mjs'

import * as fs from 'fs'
import * as path from 'path'
import { generatePatchPrompt } from '../backend/src/generate-patch'
import { TEST_USER_ID } from 'common/constants'
import { applyPatch } from 'common/util/patch'

interface ParsedData {
  oldFile: string
  sketch: string
  patch: string
  attemptedPatch?: string
}

function parseFineTuningData(filePath: string): ParsedData[] {
  const fileContent = fs.readFileSync(filePath, 'utf-8')
  const jsonLines = fileContent.split('\n').filter((line) => line.trim() !== '')

  return jsonLines
    .map((line) => {
      const jsonData = JSON.parse(line)
      const userMessage = jsonData.messages[0].content
      const assistantMessage = jsonData.messages[1].content

      const oldFileMatch = userMessage.match(/```\n([\s\S]*?)\n```/)
      const sketchMatch = userMessage.match(/```\n([\s\S]*?)\n```\s*$/m)

      const oldFile = oldFileMatch ? oldFileMatch[1] : ''
      const sketch = sketchMatch ? sketchMatch[1] : ''
      const patch = assistantMessage

      // Filter out incomplete data and entries with more than 50k characters
      if (
        !oldFile ||
        !sketch ||
        !patch ||
        oldFile.length + sketch.length + patch.length > 50_000
      ) {
        return null
      }

      return {
        oldFile,
        sketch,
        patch,
      }
    })
    .filter(Boolean) as ParsedData[]
}

async function generateAttemptedPatches(
  parsedData: ParsedData[]
): Promise<(ParsedData & { attemptedPatch: string })[]> {
  const results: (ParsedData & { attemptedPatch: string })[] = []
  const outputPath = path.join(__dirname, 'data-with-attempted-patches.json')

  let i = 0
  for (const data of parsedData) {
    i++
    console.log(`Generating patch for data ${i} of ${parsedData.length}`)
    const clientSessionId = 'fake-session-id'
    const fingerprintId = 'fake-fingerprint-id'
    const userInputId = 'fake-user-input-id'
    const filePath = 'fake-file-path.ts'
    const messageHistory: any[] = []
    const fullResponse = ''
    const userId = TEST_USER_ID

    const attemptedPatch = await generatePatchPrompt(
      clientSessionId,
      fingerprintId,
      userInputId,
      data.oldFile,
      data.sketch,
      filePath,
      messageHistory,
      fullResponse,
      userId
    )

    const result = {
      ...data,
      attemptedPatch,
    }
    results.push(result)

    // Save the current state after each patch generation
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2))
    const refinerDatasetPath = path.join(
      __dirname,
      'patch-refiner-dataset.jsonl'
    )
    createPatchRefinerDataset(results, refinerDatasetPath)
  }

  return results
}

function createPatchRefinerDataset(
  data: (ParsedData & { attemptedPatch: string })[],
  outputPath: string
) {
  const dataset = data.map((entry) => {
    const patchesEquavalent =
      applyPatch(entry.oldFile, entry.attemptedPatch) ===
      applyPatch(entry.oldFile, entry.patch)

    const conversation = {
      messages: [
        {
          role: 'user',
          content: `Please confirm or refine the following patch.

Old file:
\`\`\`
${entry.oldFile}
\`\`\`

New file (sketch of changes):
\`\`\`
${entry.sketch}
\`\`\`

Tentative patch to transform the old file into the new file:
\`\`\`
${entry.attemptedPatch}
\`\`\`

Your task is to review this tentative patch and either:
A. Confirm it is accurate by responding with just "[CONFIRMED]", or
B. Rewrite the patch in full to be more accurate, ensuring it correctly transforms the old file into the intended new file.`,
        },
        {
          role: 'assistant',
          content: patchesEquavalent ? '[CONFIRMED]' : entry.patch,
        },
      ],
    }
    return JSON.stringify(conversation)
  })

  fs.writeFileSync(outputPath, dataset.join('\n'))
  console.log(`Patch refiner dataset saved to: ${outputPath}`)
}

function appendLastFiftyEntries(data: ParsedData[], outputPath: string) {
  const lastFifty = data.slice(-50)
  const dataset = lastFifty.map((entry) => {
    const conversation = {
      messages: [
        {
          role: 'user',
          content: `Please confirm or refine the following patch.

Old file:
\`\`\`
${entry.oldFile}
\`\`\`

New file (sketch of changes):
\`\`\`
${entry.sketch}
\`\`\`

Tentative patch to transform the old file into the new file:
\`\`\`
${entry.patch}
\`\`\`

Your task is to review this tentative patch and either:
A. Confirm it is accurate by responding with just "[CONFIRMED]", or
B. Rewrite the patch in full to be more accurate, ensuring it correctly transforms the old file into the intended new file.`,
        },
        {
          role: 'assistant',
          content: '[CONFIRMED]',
        },
      ],
    }
    return JSON.stringify(conversation)
  })

  fs.appendFileSync(outputPath, dataset.join('\n') + '\n')
  console.log(`Appended last 50 entries to: ${outputPath}`)
}

async function main() {
  // Log some environment variables to verify they're loaded
  console.log('Environment:', env.ENVIRONMENT)
  console.log('Database URL:', env.DATABASE_URL)

  const validationDataPath = path.join(
    __dirname,
    'fine-tuning-validation-data-2024-09-15.jsonl'
  )
  const parsedData = parseFineTuningData(validationDataPath)

  console.log(
    `Parsed ${parsedData.length} valid entries from the validation data.`
  )

  // await generateAttemptedPatches(parsedData)

  // Add this line to call the new function
  appendLastFiftyEntries(
    parsedData,
    path.join(__dirname, 'patch-refiner-dataset.jsonl')
  )
}

main().catch(console.error)
