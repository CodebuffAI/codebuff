import { NextRequest, NextResponse } from 'next/server'
import { PostHog } from 'posthog-node'
import { env } from '@/env.mjs'

// Initialize PostHog with server-side API key
const client = new PostHog(
  env.NEXT_PUBLIC_POSTHOG_API_KEY,
  { host: env.NEXT_PUBLIC_POSTHOG_HOST_URL }
)

export async function GET(req: NextRequest) {
  // Track the Discord redirect event
  await client.capture({
    distinctId: req.headers.get('x-forwarded-for') || 'unknown',
    event: 'discord_redirect',
    properties: {
      $current_url: req.url,
      referrer: req.headers.get('referer') || 'unknown',
    }
  })

  return NextResponse.redirect('https://discord.gg/mcWTGjgTj3', 302)
}
