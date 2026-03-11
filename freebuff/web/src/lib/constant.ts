import { env } from '@codebuff/common/env'

export const siteConfig = {
  title: 'Freebuff',
  description:
    "The free coding agent. No subscription. No configuration. Start in seconds.",
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
