import path from 'path'

import {
  OpenAICompatibleChatLanguageModel,
  VERSION,
} from '@ai-sdk/openai-compatible'
import { websiteUrl } from '@codebuff/npm-app/config'
import { streamText } from 'ai'

const apiKey = '12345'

const codebuffBackendModel = new OpenAICompatibleChatLanguageModel(
  'openai/gpt-5',
  {
    provider: 'codebuff.chat',
    url: ({ path: endpoint }) =>
      new URL(path.join('/api/v1', endpoint), websiteUrl).toString(),
    headers: () => ({
      Authorization: `Bearer ${apiKey}`,
      'user-agent': `ai-sdk/openai-compatible/${VERSION}`,
    }),
    metadataExtractor: {
      extractMetadata: async (...inputs) => {
        console.log(inputs, 'extractMetadata')
        return undefined
      },
      createStreamExtractor: () => ({
        processChunk: (...inputs) => {
          console.log(
            JSON.stringify(inputs, null, 2),
            'createStreamExtractor.processChunk',
          )
        },
        buildMetadata: (...inputs) => {
          console.log(inputs, 'createStreamExtractor.buildMetadata')
          return undefined
        },
      }),
    },
    fetch: undefined,
    includeUsage: undefined,
    supportsStructuredOutputs: true,
  },
)

const response = streamText({
  // const response = await streamText({
  // const response = await generateText({
  // model: codebuffBackendProvider('openai/gpt-5'),
  model: codebuffBackendModel,
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
        run_id: '19b636d9-bfbf-40ff-b3e9-92dc86f4a8d0',
        client_id: 'test-client-id-123',
      },
    },
  },
})

for await (const chunk of response.fullStream) {
  console.dir({ chunk }, { depth: null })
}
