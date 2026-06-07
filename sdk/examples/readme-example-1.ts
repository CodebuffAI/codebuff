import { CodebuffClient } from '@codebuff/sdk'

async function main() {
  const client = new CodebuffClient({
    // Required only for the legacy hosted compatibility API.
    apiKey: process.env.CODEBUFF_API_KEY,
    cwd: process.cwd(),
  })

  // First run
  const runState1 = await client.run({
    // Hosted compatibility agent id.
    agent: 'codebuff/base@0.0.16',
    prompt: 'Create a simple calculator class',
    handleEvent: (event) => {
      // All events that happen during the run: agent start/finish, tool calls/results, text responses, errors.
      console.log('SDK Event', JSON.stringify(event))
    },
  })

  // Continue the same session with a follow-up
  const _runOrError2 = await client.run({
    agent: 'codebuff/base@0.0.16',
    prompt: 'Add unit tests for the calculator',
    previousRun: runState1, // <-- this is where your next run differs from the previous run
    handleEvent: (event) => {
      console.log('SDK Event', JSON.stringify(event))
    },
  })
}

main()
