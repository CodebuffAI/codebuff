console.log('Strange Loop initialized!')

import { promptOpenAI } from 'backend/src/openai-api'
import { models, TEST_USER_ID } from 'common/src/constants'

export async function readFile() {
  const messages = [
    {
      role: 'user' as const,
      content: 'What is 2+2?',
    },
  ]

  const response = await promptOpenAI(messages, {
    model: models.o3mini,
    clientSessionId: 'test-session',
    fingerprintId: 'test-fingerprint',
    userInputId: 'test-input',
    userId: TEST_USER_ID,
  })

  console.log('Response:', response)
}

readFile().then(() => {
  process.exit(0)
})
