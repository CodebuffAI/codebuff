import { env } from '@/env.mjs'

export const sponseeConfig = {
  berman: {
    name: 'Matthew Berman',
    referralCode: 'ref-82ca0959-1e83-4b42-9e49-9f40f0812445',
  },
} as const

export const sponsees = Object.values(sponseeConfig)

export const siteConfig = {
  title: 'ClaudeCodeBuff - Magical Coding Assistant for Peter',
  description:
    'Harness magical coding powers with ClaudeCodeBuff. Our team of unicorns, wizards, and psychics will transform your codebase with mystical AI powers.',
  keywords: () => [
    'ClaudeCodeBuff',
    'Codebuff',
    'Magical Coding',
    'Coding Wizardry',
    'AI Magic',
    'Unicorn Code',
    'Psychic Programming',
    'Spell Casting',
    'Wizarding Terminal',
    "April Fool's",
  ],
  url: () => env.NEXT_PUBLIC_APP_URL,
  googleSiteVerificationId: () => env.GOOGLE_SITE_VERIFICATION_ID || '',
}
