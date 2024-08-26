import {
  HIDE_FROM_NEW_USER_SLUGS,
  PROD_MANIFOLD_LOVE_GROUP_SLUG,
} from 'common/envs/constants'
import { removeEmojis } from './util/string'

type TopicInfo = { name: string; groupIds: string[] }

export const TOPICS_TO_SUBTOPICS: { [key: string]: TopicInfo[] } = {
  '🗳️ Politics': [
    {
      // US Politics, 2024 US Presidential Election
      name: '🇺🇸 USA',
      groupIds: ['AjxQR8JMpNyDqtiqoA96', 'rr3rBJMwh9PW8hwrgR4J'],
    },
    { name: '🇬🇧 UK', groupIds: ['aavkiDd6uZggfL3geuV2'] },
    {
      // Geopolitics, Europe, China, India, Russia, Latam, Middle East, Africa, Asia
      name: '🌍 World',
      groupIds: [
        '2wNGnksxJzypXZtiTLNL',
        'ue52QI4BQgJgAJJNjLHr',
        'oWTzfoeemQGkSoPFn2T7',
        'Y2J00UcVhr3wKq2lAOAy',
        'xg8wCPeM9JP6gD0igBrA',
        'dFsZaGwyohGDVkJi1C3E',
        '5mzNYaPKc4qXC5J0npKe',
        'bPTxMZhUYsIUXsWT969d',
        'DX94A1LQmpckcVdz5Hb3',
      ],
    },
    {
      // Ukraine-Russia War, Russia, Ukraine
      name: '🇷🇺🇺🇦 Russia & Ukraine',
      groupIds: [
        'OxcXOuxXvwsXtC0Dx5sr',
        'TIpf6j0hLpifpXN93FxE',
        '0AKCBNjWsHwpfmPOsGf6',
      ],
    },
    {
      name: '🇮🇱🇵🇸 Israel & Hamas',
      groupIds: [
        'cea99c1c-afb9-49b2-adfa-9be739adce10',
        'ECjphikMbmosJsDAAJoU', // Israel
      ],
    },
  ],
  '💻 Tech': [
    {
      name: '💻 Technology',
      groupIds: [
        'IlzY3moWwOcpsVZXCVej', // Technology
        'SmJk6RHToaLxLk0I1ZSC', // Space
      ],
    },
    {
      name: '🔬 Science',
      groupIds: [
        'XMhZ5LbQoLMZiOpQJRnj', // Science
        '97oNExy8iFftY2EgdkLw', // Climate
        'JpUqUqRn9sSWxrk0Sq35', // Health
      ],
    },
    {
      // AI, Technical AI Timelines
      name: '🤖 AI',
      groupIds: ['yEWvvwFFIqzf8JklMewp', 'GbbX9U5pYnDeftX9lxUh'],
    },
    {
      name: '👨‍💻 Code',
      groupIds: ['PZJMbrLekgJBy7OOBKGT'],
    },
    {
      name: '🧮 Math',
      groupIds: ['S1tbcVt1t5Bd9O5mVCx1'],
    },
  ],
  '💼 Business': [
    {
      // Finance, Economics
      name: '💵 Econ',
      groupIds: ['CgB83AAMkkOHSrTnzani', 'p88Ycq6yFd5ECKqq9PFO'],
    },
    {
      name: '🦄 Startups',
      groupIds: ['19c319ca-033c-474f-b417-5f07efe88ec0'],
    },
    {
      // Stocks, Tech Stocks
      name: '📈 Stocks',
      groupIds: ['QDQfgsFiQrNNlZhsRGf5', 'pK06hNX8MsNw8zaBsX2N'],
    },
    {
      // Crypto, Bitcoin
      name: '🪙 Crypto',
      groupIds: ['YuJw0M1xvUHrpiRRuKso', 'WBeBD6FyMd0NvSL0qjMb'],
    },
  ],
  '🏟️ Sports': [
    {
      name: '🏀 Basketball',
      groupIds: [
        'NjkFkdkvRvBHoeMDQ5NB', // Basketball
        // 'Tp4TDTWUGnEUMvBcCPIR', // March Madness
        '9a003f6b-9fd1-46ab-871d-2904953c4d5b', // March Madness 2024
        'beeb69e0-b36f-451a-80e1-e059df456bb1', // College Basketball
        'i0v3cXwuxmO9fpcInVYb', // NBA
        // TODO: merge these groups
      ],
    },
    {
      // NFL, College Football
      name: '🏈 NFL',
      groupIds: ['TNQwmbE5p6dnKx2e6Qlp', 'ky1VPTuxrLXMnHyajZFp'],
    },
    { name: '⚽ Soccer', groupIds: ['ypd6vR44ZzJyN9xykx6e'] },
    { name: '♟️ Chess', groupIds: ['ED7Cu6lVPshJkZ7FYePW'] },
    { name: '⚾ Baseball', groupIds: ['786nRQzgVyUnuUtaLTGW'] },
    { name: '🏎️ F1', groupIds: ['OyHBKJOz9YaGkDctpwuY'] },
    { name: '🚲 Cycling', groupIds: ['2yisxJryUq9V5sG7P6Gy'] },
    // { name: '🎾 Tennis', groupIds: ['1mvN9vIVIopcWiAsXhzp'] },
    // { name: '🏏 Cricket', groupIds: ['LcPYoqxSRdeQMms4lR3g'] },
  ],
  '🍿 Media': [
    // Movies, TV Shows, Music, Celebrities
    {
      name: '🍿 Media',
      groupIds: [
        'KSeNIu7AWgiBBM5FqVuB',
        'Xuc2UY8gGfjQqFXwxq5d',
        '4QIcUOfCSSha0JZHAg9X',
        'EUSEngFk1dGGBfaMeAmh',
      ],
    },
    { name: '🎮 Gaming', groupIds: ['5FaFmmaNNFTSA5r0vTAi'] },
    {
      name: '🎮️ Destiny.gg',
      groupIds: ['W2ES30fRo6CCbPNwMTTj'],
    },
    {
      name: '🏴‍☠️ One Piece',
      groupIds: ['uJSql24HUqpEpVU0FrjI'],
    },
  ],

  '🪂 NSFW': [
    {
      // Sex and love, Dating
      name: '❤️‍🔥 Sex and love',
      groupIds: ['3syjPCC7PxE5KurTiTT3', 'j3ZE8fkeqiKmRGumy3O1'],
    },
  ],
}

export const GROUP_SLUGS_TO_HIDE_FROM_WELCOME_FLOW = [
  'world-default',
  'shortterm-markets',
  'daily-markets',
  'global-macro',
  'politics-default', // US Politics
  'magaland',
  'donald-trump',
  'the-life-of-biden',
  // 'elon-musk-14d9d9498c7e',
  'crypto-prices', // Crypto,
  'bitcoin-maxi',
  'nasdaq', // Stocks
  'stock-marketdaily',
  'ai-stocks',
  'prices',
  'entertainment', // should follow smaller groups instead
  'entertainment-12ba84d9b720',
  'gpt5-speculation', // AI
  'chatgpt',
  '2024-3d9da60b52f8',
  'coolfold',
  'grab-bag',
  'internet',
  'sports-default',
  'football', // ambiguous - both soccer and american football
  'manifold-drama',
  'permanent-markets',
  'testing',
  PROD_MANIFOLD_LOVE_GROUP_SLUG,
  ...HIDE_FROM_NEW_USER_SLUGS,
]

export const getSubtopics = (topic: string) =>
  TOPICS_TO_SUBTOPICS[topic].map(
    (subtopic) =>
      [subtopic.name, removeEmojis(subtopic.name), subtopic.groupIds] as const
  )
export const ALL_TOPICS = Object.keys(TOPICS_TO_SUBTOPICS)
  .map((topic) => getSubtopics(topic).map(([_, subtopic]) => subtopic))
  .flat()
