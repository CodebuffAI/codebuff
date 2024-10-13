import { countTokens } from 'backend/util/token-counter'
import * as fs from 'fs'
import * as path from 'path'

const inputFile = path.join(__dirname, '..', 'data', 'raw_dataset.json')
const outputFile = path.join(__dirname, '..', 'data', 'dataset.jsonl')
const trainingOutputFile = path.join(
  __dirname,
  '..',
  'data',
  'training-dataset.jsonl'
)
const validationOutputFile = path.join(
  __dirname,
  '..',
  'data',
  'validation-dataset.jsonl'
)

interface DataEntry {
  project: string
  filePath: string
  oldFile: string
  claudeSketch: string
  patch: string
  updatedPatch: string
  newFile: string
  updatedSketch: string
}

function createTrainingDataset() {
  const rawData: DataEntry[] = JSON.parse(fs.readFileSync(inputFile, 'utf-8'))
  const jsonlContent = rawData
    .map((entry) => {
      const oldFileWithLineNumbers = entry.oldFile
        .split('\n')
        .map((line, index) => `${index + 1}|${line}`)
        .join('\n')
      const conversation = {
        messages: [
          {
            role: 'user',
            content: `
Here's an old file:

\`\`\`
${oldFileWithLineNumbers}
\`\`\`

And here's a sketch of the changes:

\`\`\`
${entry.updatedSketch}
\`\`\`

Please produce a patch file based on this change.
`.trim(),
          },
          {
            role: 'assistant',
            content: entry.updatedPatch,
          },
        ],
      }
      return JSON.stringify(conversation)
    })
    .filter((str) => countTokens(str) < 50_000)

  // Shuffle the dataset
  for (let i = jsonlContent.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[jsonlContent[i], jsonlContent[j]] = [jsonlContent[j], jsonlContent[i]]
  }

  // Split into training and validation sets
  const splitIndex = Math.floor(jsonlContent.length * 0.85)
  const trainingData = jsonlContent.slice(0, splitIndex)
  const validationData = jsonlContent.slice(splitIndex)

  // Write the original dataset
  fs.writeFileSync(outputFile, jsonlContent.join('\n'))
  console.log(`Full dataset created at: ${outputFile}`)

  // Write training dataset
  fs.writeFileSync(trainingOutputFile, trainingData.join('\n'))
  console.log(`Training dataset created at: ${trainingOutputFile}`)

  // Write validation dataset
  fs.writeFileSync(validationOutputFile, validationData.join('\n'))
  console.log(`Validation dataset created at: ${validationOutputFile}`)
}

createTrainingDataset()
