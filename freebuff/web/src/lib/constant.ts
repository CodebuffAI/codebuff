import { getFreebuffAppUrl } from './freebuff-public-env'

export const siteConfig = {
  title: 'Freebuff',
  description:
    'The free coding agent. No subscription. No configuration. Start in seconds.',
  keywords: () => [
    'Freebuff',
    'Free Coding Agent',
    'AI Coding Assistant',
    'Terminal AI',
    'Codebuff',
    'TypeScript',
    'React',
  ],
  url: getFreebuffAppUrl,
  socialImage: {
    url: '/opengraph-image.png',
    width: 1200,
    height: 630,
    alt: 'Freebuff install command: npm i -g freebuff',
  },
}
