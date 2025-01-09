import { env } from '@/env.mjs'
import OpenAI from 'openai'
import { headers } from 'next/headers'
import { z } from 'zod'

// Rate limit: 10 requests per minute per IP
const RATE_LIMIT = 10
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute in milliseconds

// Store IP addresses and their request timestamps
const ipRequests = new Map<string, { count: number; resetTime: number }>()

// Clean up old entries every minute
setInterval(() => {
  const now = Date.now()
  for (const [ip, data] of ipRequests.entries()) {
    if (data.resetTime < now) {
      ipRequests.delete(ip)
    }
  }
}, RATE_LIMIT_WINDOW)

const deepseekClient = new OpenAI({
  apiKey: env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
})

const corsHeaders = {
  'Access-Control-Allow-Origin': env.NEXT_PUBLIC_APP_URL,
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Credentials': 'true',
}

// Handle OPTIONS preflight request
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  })
}

// Define request schema
const RequestSchema = z.object({
  prompt: z.union([
    z.string().min(1, { message: 'Prompt is required' }),
    z.array(z.string()).min(1, { message: 'At least one prompt is required' }),
  ]),
})

const cleanCodeBlocks = (
  content: string
): { html: string; message: string } => {
  // Extract all code blocks
  const codeMatches = content.match(/```[\w-]*\n([\s\S]*?)\n```/g) || []

  // Get just the code content from each block
  const codeContent = codeMatches.reduce((acc, curr) => {
    const match = curr.match(/```[\w-]*\n([\s\S]*?)\n```/)
    return match ? acc + '\n' + match[1] : acc
  }, '')

  return {
    html: codeContent,
    // Keep the original text for the message, replacing code blocks with a placeholder
    message: content.replace(
      /```[\w-]*\n[\s\S]*?\n```/g,
      '- Editing file: web/src/app/page.tsx'
    ),
  }
}

const checkRateLimit = (ip: string): Response | null => {
  const now = Date.now()
  const requestData = ipRequests.get(ip)

  if (requestData) {
    // If window has expired, reset count
    if (requestData.resetTime < now) {
      ipRequests.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    } else {
      // If we're still within the window, increment count
      if (requestData.count >= RATE_LIMIT) {
        return new Response(
          JSON.stringify({
            error: 'Rate limit exceeded. Please try again later.',
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          }
        )
      }
      requestData.count++
    }
  } else {
    // First request from this IP
    ipRequests.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
  }

  return null
}

const validateRequest = async (
  request: Request
): Promise<{
  data: z.infer<typeof RequestSchema> | null
  error: Response | null
}> => {
  try {
    const body = await request.json()
    const result = RequestSchema.safeParse(body)

    if (!result.success) {
      return {
        data: null,
        error: new Response(
          JSON.stringify({
            error: result.error.issues[0].message,
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders,
            },
          }
        ),
      }
    }

    return { data: result.data, error: null }
  } catch (error) {
    console.error('Error parsing request:', error)
    return {
      data: null,
      error: new Response(
        JSON.stringify({
          error: 'Invalid request. Please check your input.',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      ),
    }
  }
}

const callDeepseekAPI = async (
  prompts: string[]
): Promise<{
  html: string
  message: string
  error: Response | null
}> => {
  try {
    const response = await deepseekClient.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content:
            "You are a helpful assistant. Respond with valid HTML body that can be injected into an iframe based on the user's messages below. Don't write comments in the code. Be succinct with your response and focus just on the code, with a brief explanation beforehand. Make sure to wrap the code in backticks (```).",
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

    return { html, message, error: null }
  } catch (error) {
    console.error('Error calling Deepseek:', error)
    return {
      html: '',
      message: '',
      error: new Response(
        JSON.stringify({ error: 'Failed to generate response' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        }
      ),
    }
  }
}

export async function POST(request: Request) {
  // Check origin
  const origin = request.headers.get('origin')
  if (origin !== env.NEXT_PUBLIC_APP_URL) {
    return new Response(JSON.stringify({ error: 'Unauthorized origin' }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    })
  }

  // Get IP address from headers
  const forwardedFor = headers().get('x-forwarded-for')
  const ip = forwardedFor?.split(',')[0] || 'unknown'

  // Check rate limit
  const rateLimitError = checkRateLimit(ip)
  if (rateLimitError) return rateLimitError

  // Validate request
  const { data, error: validationError } = await validateRequest(request)
  if (validationError) return validationError
  if (!data) {
    return new Response(JSON.stringify({ error: 'Invalid request data' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    })
  }

  // Call Deepseek API
  const prompts = Array.isArray(data.prompt) ? data.prompt : [data.prompt]
  const { html, message, error: apiError } = await callDeepseekAPI(prompts)
  if (apiError) return apiError

  return new Response(JSON.stringify({ html, message }), {
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  })
}
