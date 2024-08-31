import { escapeRegExp } from 'lodash'
import { DEV_CONFIG } from './dev'
import { EnvConfig, PROD_CONFIG } from './prod'

// Valid in web client & Vercel deployments only.
export const ENV = (process.env.NEXT_PUBLIC_FIREBASE_ENV ?? 'PROD') as
  | 'PROD'
  | 'DEV'

export const CONFIGS: { [env: string]: EnvConfig } = {
  PROD: PROD_CONFIG,
  DEV: DEV_CONFIG,
}

export const TWOMBA_ENABLED = false
export const PRODUCT_MARKET_FIT_ENABLED = false
export const SPICE_PRODUCTION_ENABLED = true
export const SPICE_TO_MANA_CONVERSION_RATE = 1
export const MIN_SPICE_DONATION = 25000
export const CHARITY_FEE = 0.05
export const SPICE_TO_CHARITY_DOLLARS = (1 / 1000) * (1 - CHARITY_FEE) // prize points -> dollars

export const SPICE_NAME = 'Prize Point'
export const SWEEPIES_NAME = 'Mana Cash'
export const SPICE_MARKET_TOOLTIP = `Prize market! Earn ${SPICE_NAME}s on resolution`
export const SWEEPIES_MARKET_TOOLTIP = `Cash market! Earn ${SWEEPIES_NAME}s on resolution`

export const TRADE_TERM = TWOMBA_ENABLED ? 'trade' : 'bet'
export const TRADED_TERM = TWOMBA_ENABLED ? 'traded' : 'bet'
export const TRADING_TERM = TWOMBA_ENABLED ? 'trading' : 'betting'
export const TRADER_TERM = TWOMBA_ENABLED ? 'trader' : 'bettor'

export const ENV_CONFIG = CONFIGS[ENV]

export function isAdminId(id: string) {
  return ENV_CONFIG.adminIds.includes(id)
}

export function isModId(id: string) {
  return MOD_IDS.includes(id)
}
export const DOMAIN = ENV_CONFIG.domain
export const LOVE_DOMAIN = ENV_CONFIG.loveDomain
export const LOVE_DOMAIN_ALTERNATE = ENV_CONFIG.loveDomainAlternate
export const FIREBASE_CONFIG = ENV_CONFIG.firebaseConfig
export const PROJECT_ID = ENV_CONFIG.firebaseConfig.projectId
export const IS_PRIVATE_MANIFOLD = ENV_CONFIG.visibility === 'PRIVATE'

export const AUTH_COOKIE_NAME = `FBUSER_${PROJECT_ID.toUpperCase().replace(
  /-/g,
  '_'
)}`

// Manifold's domain or any subdomains thereof
export const CORS_ORIGIN_MANIFOLD = new RegExp(
  '^https?://(?:[a-zA-Z0-9\\-]+\\.)*' + escapeRegExp(ENV_CONFIG.domain) + '$'
)
// Manifold love domain or any subdomains thereof
export const CORS_ORIGIN_MANIFOLD_LOVE = new RegExp(
  '^https?://(?:[a-zA-Z0-9\\-]+\\.)*' +
    escapeRegExp(ENV_CONFIG.loveDomain) +
    '$'
)
// Manifold love domain or any subdomains thereof
export const CORS_ORIGIN_MANIFOLD_LOVE_ALTERNATE = new RegExp(
  '^https?://(?:[a-zA-Z0-9\\-]+\\.)*' +
    escapeRegExp(ENV_CONFIG.loveDomainAlternate) +
    '$'
)

export const CORS_ORIGIN_CHARITY = new RegExp(
  '^https?://(?:[a-zA-Z0-9\\-]+\\.)*' + escapeRegExp('manifund.org') + '$'
)

// Vercel deployments, used for testing.
export const CORS_ORIGIN_VERCEL = new RegExp(
  '^https?://[a-zA-Z0-9\\-]+' + escapeRegExp('mantic.vercel.app') + '$'
)
// Any localhost server on any port
export const CORS_ORIGIN_LOCALHOST = /^http:\/\/localhost:\d+$/

// TODO: These should maybe be part of the env config?
export const BOT_USERNAMES = [
  'TenShinoe908',
  'subooferbot',
  'pos',
  'v',
  'acc',
  'jerk',
  'snap',
  'ArbitrageBot',
  'MarketManagerBot',
  'Botlab',
  'JuniorBot',
  'ManifoldDream',
  'ManifoldBugs',
  'ACXBot',
  'JamesBot',
  'RyanBot',
  'trainbot',
  'runebot',
  'LiquidityBonusBot',
  '538',
  'FairlyRandom',
  'Anatolii',
  'JeremyK',
  'Botmageddon',
  'SmartBot',
  'ShifraGazsi',
  'NiciusBot',
  'Bot',
  'Mason',
  'VersusBot',
  'GPT4',
  'EntropyBot',
  'veat',
  'ms_test',
  'arb',
  'Turbot',
  'MetaculusBot',
  'burkebot',
  'Botflux',
  '7',
  'hyperkaehler',
  'NcyBot',
  'ithaca',
  'GigaGaussian',
  'BottieMcBotface',
  'Seldon',
  'OnePercentBot',
  'arrbit',
  'ManaMaximizer',
  'rita',
  'uhh',
  'ArkPoint',
  'EliBot',
  'manifestussy',
  'mirrorbot',
  'JakeBot',
  'loopsbot',
  'breezybot',
  'echo',
  'Sayaka',
  'cc7',
  'Yuna',
  'ManifoldLove',
  'chooterb0t',
  'bonkbot',
  'NermitBundaloy',
  'FirstBot',
  'bawt',
  'FireTheCEO',
  'JointBot',
  'WrenTec',
  'TigerMcBot',
  'Euclidean',
  'manakin',
  'LUCAtheory',
  'TunglBot',
  'timetraveler',
  'bayesianbot',
  'CharlesLienBot',
  'JaguarMcBot',
  'AImogus',
  'brake',
  'brontobot',
  'OracleBot',
  'spacedroplet',
  'AriZernerBot',
  'PV_bot',
]

export const MOD_IDS = [
  'qnIAzz9RamaodeiJSiGZO6xRGC63', // Agh
  'srFlJRuVlGa7SEJDM4cY9B5k4Lj2', //bayesian
  'EJQOCF3MfLTFYbhiKncrNefQDBz1', // chrisjbillington
  'MV9fTVHetcfp3h6CVYzpypIsbyN2', // CodeandSolder
  'HTbxWFlzWGeHUTiwZvvF0qm8W433', // Conflux
  '9dAaZrNSx5OT0su6rpusDoG9WPN2', // dglid
  '5XMvQhA3YgcTzyoJRiNqGWyuB9k2', // dreev
  '946iB1LqFIR06G7d8q89um57PHh2', // egroj
  'hqdXgp0jK2YMMhPs067eFK4afEH3', // Eliza
  'kbHiTAGBahXdX9Z4sW29JpNrB0l2', // Ernie
  'W4yEF6idSMcNWEVUquowziSCZFI3', // EvanDaniel
  '2VhlvfTaRqZbFn2jqxk2Am9jgsE2', // Gabrielle
  'cA1JupYR5AR8btHUs2xvkui7jA93', // Gen
  'YGZdZUSFQyM8j2YzPaBqki8NBz23', // jack
  'cgrBqe2O3AU4Dnng7Nc9wuJHLKb2', // jskf
  '4juQfJkFnwX9nws3dFOpz4gc1mi2', // jacksonpolack
  'XeQf3ygmrGM1MxdsE3JSlmq8vL42', // Jacy
  'eSqS9cD5mzYcP2o7FrST8aC5IWn2', // PlasmaBallin (previously JosephNoonan)
  'JlVpsgzLsbOUT4pajswVMr0ZzmM2', // Joshua
  '7HhTMy4xECaVKvl5MmEAfVUkRCS2', // KevinBurke
  'jO7sUhIDTQbAJ3w86akzncTlpRG2', // MichaelWheatley
  'lkkqZxiWCpOgtJ9ztJcAKz4d9y33', // NathanpmYoung
  'fSrex43BDjeneNZ4ZLfxllSb8b42', // NcyRocks
  'BgCeVUcOzkexeJpSPRNomWQaQaD3', // SemioticRivalry
  'KHX2ThSFtLQlau58hrjtCX7OL2h2', // shankypanky (stefanie)
  'hUM4SO8a8qhfqT1gEZ7ElTCGSEz2', // Stralor
  'tO4DwIsujySUwtSnrr2hnU1WJtJ3', // WieDan
]

export const MVP = ['Eliza', 'Gabrielle']

export const VERIFIED_USERNAMES = [
  'EliezerYudkowsky',
  'ScottAlexander',
  'Aella',
  'ZviMowshowitz',
  'GavrielK',
  'CGPGrey',
  'LexFridman',
  'patio11',
  'RichardHanania',
  'Qualy',
  'Roko',
  'JonathanBlow',
  'DwarkeshPatel',
  'ByrneHobart',
  'RobertWiblin',
  'KelseyPiper',
  'SpencerGreenberg',
  'PaulChristiano',
  'BuckShlegeris',
  'Natalia',
  'zero',
  'OzzieGooen',
  'OliverHabryka',
  'Alicorn',
  'RazibKhan',
  'JamesMedlock',
  'Writer',
  'GeorgeHotz',
  'ShayneCoplan',
  'SanghyeonSeo',
  'KatjaGrace',
  'EmmettShear',
  'CateHall',
  'RobertSKMiles',
  'TarekMansour',
  'DylanMatthews',
  'RobinHanson',
  'KevinRoose18ac',
  'KnowNothing',
  'SantaPawsSSB',
  'AndersSandberg',
  'JosephWeisenthal',
  'LawrenceLessig',
  'NatFriedman',
  'patrissimo',
  'postjawline',
  'MatthewYglesias',
  'BillyMcRascal',
  'kyootbot',
  'MaximLott',
  'liron',
  'LarsDoucet',
  'PeterWildeford',
  'SethWalder',
  'SneakySly',
  'ConorSen',
  'transmissions11',
  'DanHendrycks',
]

export const BLESSED_BANNED_USER_IDS = [
  'wBZSAA3MrnWjz7eHrKAq43OXBtA2', // kazoo
  '4Qy6MOn8AFRTecA6FMzdljPJFsv1', //HamsterHawk
]

export const PARTNER_USER_IDS: string[] = [
  'sTUV8ejuM2byukNZp7qKP2OKXMx2', // NFL
  'rFJu0EIdR6RP8d1vHKSh62pbnbH2', // SimonGrayson
  'cb6PJqGOSVPEUhprDHCKWWMuJqu1', // DanMan314
  'HTbxWFlzWGeHUTiwZvvF0qm8W433', // Conflux
  'YGZdZUSFQyM8j2YzPaBqki8NBz23', // jack
  'hDq0cvn68jbAUVd6aWIU9aSv9ZA2', // strutheo
  'OEbsAczmbBc4Sl1bacYZNPJLLLc2', // SirCryptomind
  'JlVpsgzLsbOUT4pajswVMr0ZzmM2', // Joshua
  'xQqqZqlgcoSxTgPe03BiXmVE2JJ2', // Soli
  'Iiok8KHMCRfUiwtMq1tl5PeDbA73', // Lion
  'SqOJYkeySMQjqP3UAypw6DxPx4Z2', // Shump
  'hqdXgp0jK2YMMhPs067eFK4afEH3', // Eliza
  'BgCeVUcOzkexeJpSPRNomWQaQaD3', // SemioticRivalry
  'X1xu1kvOxuevx09xuR2urWfzf7i1', // KeenenWatts
  '4juQfJkFnwX9nws3dFOpz4gc1mi2', // jacksonpolack
  '5LZ4LgYuySdL1huCWe7bti02ghx2', // James
  '8WEiWcxUd7QLeiveyI8iqbSIffU2', // goblinodds
  'Iua2KQvL6KYcfGLGNI6PVeGkseo1', // Ziddletwix
  'GRaWlYn2fNah0bvr6OW28l28nFn1', // cash
  'ZKkL3lFRFaYfiaT9ZOdiv2iUJBM2', // mint
  'hRbPwezgxnat6GpJQxoFxq1xgUZ2', // AmmonLam
  'iPQVGUbwOfT3MmWIZs3JaruVzhV2', // Mugiwaraplus
  'k9gKj9BgTLN5tkqYztHeNoSpwyl1', // OnePieceExplained
  'foOeshHZOET3yMvRTMPINpnb8Bj2', // PunishedFurry
  'EBGhoFSxRtVBu4617SLZUe1FeJt1', // FranklinBaldo
  'GPlNcdBrcfZ3PiAfhnI9mQfHZbm1', // RemNi
  '4xOTMCIOkGesdJft50wVFZFb5IB3', // Tripping
  'hUM4SO8a8qhfqT1gEZ7ElTCGSEz2', // Stralor aka Pat Scott
  'srFlJRuVlGa7SEJDM4cY9B5k4Lj2', // Bayesian
  'H6b5PWELWfRV6HhyHAlCGq7yJJu2', // AndrewG
  'EJQOCF3MfLTFYbhiKncrNefQDBz1', // chrisjbillington
  '7HhTMy4xECaVKvl5MmEAfVUkRCS2', // KevinBurke
  'oPxjIzlvC5fRbGCaVgkvAiyoXBB2', // mattyb
]

export const NEW_USER_HERLPER_IDS = [
  'cgrBqe2O3AU4Dnng7Nc9wuJHLKb2', // jskf
  '2VhlvfTaRqZbFn2jqxk2Am9jgsE2', // Gabrielle
  '4juQfJkFnwX9nws3dFOpz4gc1mi2', // jacksonpolack
  'BgCeVUcOzkexeJpSPRNomWQaQaD3', // SemioticRivalry
  'rQPOELuW5zaapaNPnBYQBMoonk92', // Tumbles
  'igi2zGXsfxYPgB0DJTXVJVmwCOr2', // Austin
  '5LZ4LgYuySdL1huCWe7bti02ghx2', // James
  'tlmGNz9kjXc2EteizMORes4qvWl2', // Stephen
  '0k1suGSJKVUnHbCPEhHNpgZPkUP2', // Sinclair
  'AJwLWoo3xue32XIiAVrL5SyR1WB2', // Ian
  'uglwf3YKOZNGjjEXKc5HampOFRE2', // D4vid
  'GRwzCexe5PM6ThrSsodKZT9ziln2', // Inga
  'cA1JupYR5AR8btHUs2xvkui7jA93', // Genzy
  'hUM4SO8a8qhfqT1gEZ7ElTCGSEz2', // Stralor
  'sA7V30Ic73XZtniboy2eKr6ekkn1', // MartinRandall
  'JlVpsgzLsbOUT4pajswVMr0ZzmM2', // Joshua
  'srFlJRuVlGa7SEJDM4cY9B5k4Lj2', // Bayesian
  'oPxjIzlvC5fRbGCaVgkvAiyoXBB2', // mattyb
  'Gg7t9vPD4WPD1iPgj9RUFLYTxgH2', // nikki
  'OdBj5DW6PbYtnImvybpyZzfhb133', // @jim
]

export const OPTED_OUT_OF_LEAGUES = [
  'vuI5upWB8yU00rP7yxj95J2zd952', // ManifoldPolitics
  '8lZo8X5lewh4hnCoreI7iSc0GxK2', // ManifoldAI
  'IPTOzEqrpkWmEzh6hwvAyY9PqFb2', // Manifold
  'tRZZ6ihugZQLXPf6aPRneGpWLmz1', // ManifoldLove
  'BhNkw088bMNwIFF2Aq5Gg9NTPzz1', // acc
  'JlVpsgzLsbOUT4pajswVMr0ZzmM2', // Joshua
  'oPxjIzlvC5fRbGCaVgkvAiyoXBB2', // mattyb
  'NndHcEmeJhPQ6n7e7yqAPa3Oiih2', //josh
]

export const HIDE_FROM_LEADERBOARD_USER_IDS = [
  'BhNkw088bMNwIFF2Aq5Gg9NTPzz1', // acc
  'tRZZ6ihugZQLXPf6aPRneGpWLmz1', // ManifoldLove
]

export const HOUSE_BOT_USERNAME = 'acc'

export function supabaseUserConsolePath(userId: string) {
  const tableId = ENV === 'DEV' ? 19247 : 25916
  return `https://supabase.com/dashboard/project/${ENV_CONFIG.supabaseInstanceId}/editor/${tableId}/?filter=id%3Aeq%3A${userId}`
}

export function supabasePrivateUserConsolePath(userId: string) {
  const tableId = ENV === 'DEV' ? 2189688 : 153495548
  return `https://supabase.com/dashboard/project/${ENV_CONFIG.supabaseInstanceId}/editor/${tableId}/?filter=id%3Aeq%3A${userId}`
}

export function supabaseConsoleContractPath(contractId: string) {
  const tableId = ENV === 'DEV' ? 19254 : 25924
  return `https://supabase.com/dashboard/project/${ENV_CONFIG.supabaseInstanceId}/editor/${tableId}?filter=id%3Aeq%3A${contractId}`
}

export const GOOGLE_PLAY_APP_URL =
  'https://play.google.com/store/apps/details?id=com.markets.manifold'
export const APPLE_APP_URL =
  'https://apps.apple.com/us/app/manifold-markets/id6444136749'

export const TEN_YEARS_SECS = 60 * 60 * 24 * 365 * 10

export const DESTINY_GROUP_SLUG = 'destinygg'
export const PROD_MANIFOLD_LOVE_GROUP_SLUG = 'manifoldlove-relationships'

export const RATING_GROUP_SLUGS = ['nonpredictive', 'unsubsidized']

export const GROUP_SLUGS_TO_IGNORE_IN_MARKETS_EMAIL = [
  'manifold-6748e065087e',
  'manifold-features-25bad7c7792e',
  'bugs',
  'manifold-leagues',
  ...RATING_GROUP_SLUGS,
  DESTINY_GROUP_SLUG,
  PROD_MANIFOLD_LOVE_GROUP_SLUG,
]

// - Hide markets from signed-out landing page
// - Hide from onboarding topic selector
// - De-emphasize markets in the very first feed items generated for new users
export const HIDE_FROM_NEW_USER_SLUGS = [
  'fun',
  'selfresolving',
  'experimental',
  'trading-bots',
  'gambling',
  'free-money',
  'mana',
  'whale-watching',
  'spam',
  'test',
  'no-resolution',
  'eto',
  'friend-stocks',
  'ancient-markets',
  'jokes',
  'planecrash',
  'glowfic',
  'all-stonks',
  'the-market',
  'nonpredictive-profits',
  'personal-goals',
  'personal',
  'rationalussy',
  'nsfw',
  'manifold-6748e065087e',
  'bugs',
  'new-years-resolutions-2024',
  'metamarkets',
  'metaforecasting',
  'death-markets',
  ...GROUP_SLUGS_TO_IGNORE_IN_MARKETS_EMAIL,
]

export const GROUP_SLUGS_TO_NOT_INTRODUCE_IN_FEED = [
  'rationalussy',
  'nsfw',
  'planecrash',
  'glowfic',
  'no-resolution',
  'the-market',
  'spam',
  'test',
  'eto',
  'friend-stocks',
  'testing',
  'all-stonks',
  PROD_MANIFOLD_LOVE_GROUP_SLUG,
]

export const EXTERNAL_REDIRECTS = ['/umami']

export const DISCORD_INVITE_LINK = 'https://discord.com/invite/eHQBNBqXuh'
export const DISCORD_BOT_INVITE_LINK =
  'https://discord.com/api/oauth2/authorize?client_id=1074829857537663098&permissions=328565385280&scope=bot%20applications.commands'

export const YES_GRAPH_COLOR = '#11b981'

export const RESERVED_PATHS = [
  '_next',
  'about',
  'ad',
  'add-funds',
  'ads',
  'analytics',
  'api',
  'browse',
  'calibration',
  'card',
  'cards',
  'career',
  'careers',
  'charity',
  'common',
  'contact',
  'contacts',
  'cowp',
  'create',
  'date-docs',
  'dashboard',
  'discord',
  'discord-bot',
  'dream',
  'embed',
  'facebook',
  'find',
  'github',
  'google',
  'group',
  'groups',
  'help',
  'home',
  'jobs',
  'leaderboard',
  'leaderboards',
  'league',
  'leagues',
  'link',
  'linkAccount',
  'links',
  'live',
  'login',
  'lootbox',
  'mana-auction',
  'manifest',
  'markets',
  'messages',
  'mtg',
  'news',
  'notifications',
  'og-test',
  'payments',
  'portfolio',
  'privacy',
  'profile',
  'public',
  'questions',
  'referral',
  'referrals',
  'send',
  'server-sitemap',
  'sign-in',
  'sign-in-waiting',
  'sitemap',
  'slack',
  'stats',
  'styles',
  'swipe',
  'team',
  'terms',
  'tournament',
  'tournaments',
  'twitch',
  'twitter',
  'umami',
  'user',
  'users',
  'versus',
  'web',
  'welcome',
]

export const MANA_PURCHASE_RATE_CHANGE_DATE = new Date('2024-05-16T18:20:00Z')
