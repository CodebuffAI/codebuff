import { env } from '@/env.mjs'

export const siteConfig = {
  title: 'Manicode',
  description:
    'Manicode is a tool for editing codebases via natural language instruction to Mani, an expert AI programming assistant.',
  keywords: () => [
    'Manicode',
    'Coding Assistant',
    'Coding Assistant',
    'Agent',
    'AI',
    'Next.js',
    'React',
    'TypeScript',
  ],
  url: () => env.APP_URL,
  googleSiteVerificationId: () => env.GOOGLE_SITE_VERIFICATION_ID || '',
}
