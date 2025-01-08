import { env } from '@/env.mjs'
import OpenAI from 'openai'

const deepseekClient = new OpenAI({
  apiKey: env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
})

const cleanCodeBlocks = (
  content: string
): { html: string; message: string } => {
  // Split content into sections based on code blocks
  const parts = content.split(/(```[\w-]*\n[\s\S]*?\n```)/g)

  // Process each part
  const processedParts = parts.map((part) => {
    const codeMatch = part.match(/```[\w-]*\n([\s\S]*?)\n```/)
    if (codeMatch) {
      // For code blocks, return just the code content for HTML
      return codeMatch[1]
    }
    // For non-code blocks, keep the text as is
    return part
  })

  return {
    // For HTML, join all parts (code blocks will be just the code)
    html: processedParts.join(''),
    // For message, keep the original text with code blocks removed
    message: content.replace(
      /```[\w-]*\n[\s\S]*?\n```/g,
      '- Editing file: web/src/app/page.tsx'
    ),
  }
}

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json()
    if (!prompt)
      return new Response(JSON.stringify({ error: 'No prompt provided' }), {
        status: 400,
      })

    const prompts = Array.isArray(prompt) ? prompt : [prompt]

    const response = await deepseekClient.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content:
            "You are a helpful assistant. Respond with valid HTML body that can be injected into an iframe based on the user's messages below.",
        },
        ...prompts.map((p) => ({
          role: 'user' as const,
          content: p,
        })),
      ],
      temperature: 0,
    })

    const { html, message } = cleanCodeBlocks(
      response.choices[0]?.message?.content || 'No response generated'
    )

    // Wrap the HTML in a complete document
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              margin: 0;
              padding: 16px;
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
              font-size: 14px;
            }
            .error { color: #EF4444; }
            .success { color: #10B981; }
            h1 { font-size: 24px; margin-bottom: 16px; }
            p { margin: 8px 0; }
            pre { white-space: pre-wrap; }
          </style>
        </head>
        <body>
          ${html}
        </body>
      </html>
    `

    return new Response(JSON.stringify({ html: htmlContent, message }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error calling Deepseek:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to generate response' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
