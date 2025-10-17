import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { websiteUrl } from '@codebuff/npm-app/config'
import { generateObject } from 'ai'
import z from 'zod/v4'

const codebuffBackendProvider = createOpenAICompatible({
  name: 'codebuff',
  apiKey: '12345',
  baseURL: websiteUrl + '/api/v1',
  // apiKey: process.env.OPEN_ROUTER_API_KEY,
  // baseURL: 'https://openrouter.ai/api/v1',
  supportsStructuredOutputs: true,
})

const response = await generateObject({
  schema: z.object({ greeting: z.string() }),
  // const response = await streamText({
  // const response = await generateText({
  model: codebuffBackendProvider('openai/gpt-5'),
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
