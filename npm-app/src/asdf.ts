import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { streamText } from 'ai'

import { websiteUrl } from './config'

const codebuffBackendProvider = createOpenAICompatible({
  name: 'codebuff',
  apiKey: '12345',
  baseURL: websiteUrl + '/api/v1',
})

const response = streamText({
  model: codebuffBackendProvider('openai/gpt-5'),
  messages: [
    {
      role: 'user',
      content:
        'This is a bunch of text just to fill out some space. Ignore this.'.repeat(
          100,
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
  providerOptions: {
    codebuff: {
      // all these get directly added to the body at the top level
      reasoningEffort: 'low',
      codebuff_metadata: {
        agent_run_id: 'testing',
      },
    },
  },
})
for await (const chunk of response.fullStream) {
  console.log('asdf', { chunk })
}
