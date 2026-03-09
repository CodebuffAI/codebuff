import { env } from '@codebuff/common/env'

export const siteConfig = {
  title: 'Freebuff',
  description:
    "The world's strongest free coding agent. Describe what you want, and Freebuff edits your code — no subscription or credits required.",
  keywords: () => [
    'Freebuff',
    'Free Coding Agent',
    'AI Coding Assistant',
    'Terminal AI',
    'Codebuff',
    'TypeScript',
    'React',
  ],
  url: () => env.NEXT_PUBLIC_CODEBUFF_APP_URL,
}
