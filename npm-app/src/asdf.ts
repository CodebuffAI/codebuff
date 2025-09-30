import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { streamText } from 'ai'

import { backendUrl } from './config'

const codebuffBackendProvider = createOpenAICompatible({
  name: 'codebuff',
  apiKey: '12345',
  baseURL: backendUrl + '/api/v1',
})

const response = streamText({
  model: codebuffBackendProvider('anthropic/claude-sonnet-4.5'),
  messages: [
    {
      role: 'user',
      content:
        'This is a bunch of text just to fill out some space. Ignore this.'.repeat(
          1000,
        ),
    },
    {
      role: 'user',
      content: 'Hello',
      providerOptions: {
        codebuff: {
          cacheControl: { type: 'ephemeral' },
        },
      },
    },
  ],
})
for await (const chunk of response.fullStream) {
  console.log('asdf', { chunk })
}
