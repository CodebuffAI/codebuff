import { env } from '@/env.mjs'

export const siteConfig = {
  title: 'Codebuff',
  description:
    'Code faster with AI using Codebuff. Edit your codebase and run terminal commands via natural language instruction.',
  keywords: () => [
    'Manicode',
    'Codebuff',
    'Coding Assistant',
    'Coding Assistant',
    'Agent',
    'AI',
    'Next.js',
    'React',
    'TypeScript',
  ],
  url: () => env.NEXT_PUBLIC_APP_URL,
  googleSiteVerificationId: () => env.GOOGLE_SITE_VERIFICATION_ID || '',
}
