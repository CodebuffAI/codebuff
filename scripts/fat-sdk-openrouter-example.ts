import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { websiteUrl } from '@codebuff/npm-app/config'
import { generateText } from 'ai'

const codebuffBackendProvider = createOpenAICompatible({
  name: 'codebuff',
  apiKey: '12345',
  baseURL: websiteUrl + '/api/v1',
})

// const response = await streamText({
const response = await generateText({
  model: codebuffBackendProvider('anthropic/claude-sonnet-4.5'),
  messages: [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'This is a bunch of text just to fill out some space. Ignore this.'.repeat(
            100,
          ),
        },
        {
          type: 'text',
          text: 'Hello',
          providerOptions: {
            openaiCompatible: {
              cache_control: { type: 'ephemeral' },
            },
          },
        },
      ],
    },
  ],
  providerOptions: {
    codebuff: {
      // all these get directly added to the body at the top level
      reasoningEffort: 'low',
      codebuff_metadata: {
        agent_run_id: '19b636d9-bfbf-40ff-b3e9-92dc86f4a8d0',
        client_id: 'test-client-id-123',
        client_request_id: 'test-client-session-id-456',
      },
    },
  },
})

console.dir({ response }, { depth: null })
// for await (const chunk of response.fullStream) {
//   console.dir({ chunk }, { depth: null })
// }
