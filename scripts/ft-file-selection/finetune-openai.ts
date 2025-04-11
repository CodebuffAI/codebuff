import fs from 'fs'

import OpenAI from 'openai'

const OPEN_AI_KEY = process.env.OPEN_AI_KEY

if (!OPEN_AI_KEY) {
  console.error('Missing OPEN_AI_KEY environment variable')
  process.exit(1)
}

const openai = new OpenAI({
  apiKey: OPEN_AI_KEY,
})

async function uploadFile(): Promise<string> {
  try {
    // TODO: Let's use either REST API or SDK consistently in both places.
    // For some reason I couldn't get the file-upload REST API to work
    const file = await openai.files.create({
      file: fs.createReadStream(
        'scripts/ft-file-selection/openai-tune-data.jsonl'
      ),
      purpose: 'fine-tune',
    })

    console.log('Upload successful! File ID:', file.id)
    return file.id
  } catch (error) {
    console.error('Upload error:', error)
    process.exit(1)
  }
}

async function createFineTuningJob(fileId: string) {
  try {
    const response = await fetch('https://api.openai.com/v1/fine_tuning/jobs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPEN_AI_KEY}`,
      },
      body: JSON.stringify({
        training_file: fileId,
        model: 'gpt-4o-mini-2024-07-18',
        suffix: 'file-selection',
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Fine-tuning job creation failed:', data)
      process.exit(1)
    }

    console.log('Fine-tuning job created successfully:', data)
  } catch (error) {
    console.error('Fine-tuning error:', error)
    process.exit(1)
  }
}

async function main() {
  // Step 1: Upload the file
  const fileId = await uploadFile()

  // Step 2: Create fine-tuning job
  await createFineTuningJob(fileId)
}

main()
