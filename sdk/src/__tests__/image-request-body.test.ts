/**
 * End-to-end guard on the shape of an image as it leaves for the provider.
 *
 * The converter in @codebuff/llm-providers implements LanguageModelV2, where a
 * file part's `data` is the raw value. This package runs `ai` v7, which hands
 * the model a LanguageModelV4 prompt through a compatibility proxy that
 * forwards the prompt untouched — and there `data` is a TAGGED wrapper. The
 * package's own unit tests fed the converter the raw v2 shape and passed while
 * production sent `data:image/png;base64,[object Object]`, which OpenAI
 * rejected ("invalid base64-encoded value") on every GPT-5.6 Luna turn
 * carrying an image.
 *
 * So this test asserts on the real wire body produced by the real streamText →
 * model path, not on the converter in isolation: it is the seam that broke.
 */
import { describe, it, expect } from 'bun:test'
import { OpenAICompatibleChatLanguageModel } from '@codebuff/llm-providers/openai-compatible'
import { streamText } from 'ai'

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const VALID_IMAGE_DATA_URL = /^data:image\/[\w.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/

async function imageUrlSentToProvider(
  imagePart: unknown,
): Promise<string | undefined> {
  let sentBody: any
  const model = new OpenAICompatibleChatLanguageModel('openai/gpt-5.6-luna', {
    provider: 'test',
    url: () => 'https://example.com/v1/chat/completions',
    headers: () => ({}),
    fetch: (async (_input: unknown, init: any) => {
      sentBody = JSON.parse(init.body)
      return new Response(
        'data: {"id":"1","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}]}\n\n' +
          'data: [DONE]\n\n',
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      )
    }) as any,
  })

  const result = streamText({
    model: model as any,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'what is this' }, imagePart as any],
      },
    ],
  })
  // Drain so the request is actually issued.
  for await (const _chunk of result.textStream) {
  }

  return sentBody?.messages?.[0]?.content?.[1]?.image_url?.url
}

describe('images on the wire', () => {
  it('sends a valid base64 data URL for a base64 image part (CLI/Desktop shape)', async () => {
    const url = await imageUrlSentToProvider({
      type: 'image',
      image: PNG_BYTES.toString('base64'),
      mediaType: 'image/png',
    })

    expect(url).toMatch(VALID_IMAGE_DATA_URL)
    expect(url).toBe(`data:image/png;base64,${PNG_BYTES.toString('base64')}`)
  })

  it('sends a valid base64 data URL for a data-URL image part', async () => {
    const url = await imageUrlSentToProvider({
      type: 'image',
      image: `data:image/png;base64,${PNG_BYTES.toString('base64')}`,
      mediaType: 'image/png',
    })

    expect(url).toMatch(VALID_IMAGE_DATA_URL)
    expect(url).toBe(`data:image/png;base64,${PNG_BYTES.toString('base64')}`)
  })

  it('sends a valid base64 data URL for a byte-array image part', async () => {
    const url = await imageUrlSentToProvider({
      type: 'image',
      image: new Uint8Array(PNG_BYTES),
      mediaType: 'image/png',
    })

    expect(url).toMatch(VALID_IMAGE_DATA_URL)
  })

  it('sends a valid base64 data URL for a file part', async () => {
    const url = await imageUrlSentToProvider({
      type: 'file',
      data: PNG_BYTES.toString('base64'),
      mediaType: 'image/png',
    })

    expect(url).toMatch(VALID_IMAGE_DATA_URL)
  })
})
