import { getUserCredentials } from '@codebuff/npm-app/credentials'

import { CodebuffClient } from '../src/client'

export async function testSdk() {
  const apiKey = getUserCredentials()?.authToken
  if (!apiKey) {
    throw new Error('Could not load API key from user credentials')
  }

  const client = new CodebuffClient({
    apiKey,
  })

  const run = await client.run({
    agent: 'base',
    prompt: 'Create a simple calculator class',
    handleEvent: (event) => {
      console.log(event)
    },
  })

  console.log(run)
}

testSdk()
