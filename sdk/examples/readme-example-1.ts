import { CodebirdsClient } from '@codebirds/sdk'

async function main() {
  const client = new CodebirdsClient({
    // You need to pass in your own API key here.
    // Get one here: https://www.codebirds.com/api-keys
    apiKey: process.env.CODEBIRDS_API_KEY,
    cwd: process.cwd(),
  })

  // First run
  const runState1 = await client.run({
    // The agent id. Any agent on the store (https://codebirds.com/store)
    agent: 'codebirds/base@0.0.16',
    prompt: 'Create a simple calculator class',
    handleEvent: (event) => {
      // All events that happen during the run: agent start/finish, tool calls/results, text responses, errors.
      console.log('Codebirds Event', JSON.stringify(event))
    },
  })

  // Continue the same session with a follow-up
  const _runOrError2 = await client.run({
    agent: 'codebirds/base@0.0.16',
    prompt: 'Add unit tests for the calculator',
    previousRun: runState1, // <-- this is where your next run differs from the previous run
    handleEvent: (event) => {
      console.log('Codebirds Event', JSON.stringify(event))
    },
  })
}

main()
