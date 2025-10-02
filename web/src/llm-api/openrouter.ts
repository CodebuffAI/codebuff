import { env } from '@codebuff/internal/env'

export async function handleOpenrouterStream({ body }: { body: any }) {
  // Ensure usage tracking is enabled
  if (body.usage === undefined) {
    body.usage = {}
  }
  body.usage.include = true

  const response = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPEN_ROUTER_API_KEY}`,
        'HTTP-Referer': 'https://codebuff.com',
        'X-Title': 'Codebuff',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )

  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.statusText}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Failed to get response reader')
  }

  let heartbeatInterval: ReturnType<typeof setInterval>

  // Create a ReadableStream that Next.js can handle
  const stream = new ReadableStream({
    async start(controller) {
      const decoder = new TextDecoder()
      let buffer = ''

      // Send initial connection message
      controller.enqueue(
        new TextEncoder().encode(`: connected ${new Date().toISOString()}\n`)
      )

      // Start heartbeat
      heartbeatInterval = setInterval(() => {
        controller.enqueue(
          new TextEncoder().encode(
            `: heartbeat ${new Date().toISOString()}\n\n`
          )
        )
      }, 30000)

      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            break
          }

          buffer += decoder.decode(value, { stream: true })
          let lineEnd = buffer.indexOf('\n')

          while (lineEnd !== -1) {
            const line = buffer.slice(0, lineEnd + 1)
            buffer = buffer.slice(lineEnd + 1)

            // Forward the line to the client
            controller.enqueue(new TextEncoder().encode(line))

            lineEnd = buffer.indexOf('\n')
          }
        }

        controller.close()
      } catch (error) {
        controller.error(error)
      } finally {
        clearInterval(heartbeatInterval)
        reader.cancel()
      }
    },
    cancel() {
      clearInterval(heartbeatInterval)
      reader.cancel()
    },
  })

  return stream
}
