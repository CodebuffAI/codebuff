import { EnvConfig, PROD_CONFIG } from './prod'

export const DEV_CONFIG: EnvConfig = {
  ...PROD_CONFIG,
  domain: 'dev.manifold.markets',
  loveDomain: 'dev.manifold.love',
  loveDomainAlternate: 'dev.manifoldlove.com',
  googleAnalyticsId: '',
  firebaseConfig: {
    apiKey: 'AIzaSyBoq3rzUa8Ekyo3ZaTnlycQYPRCA26VpOw',
    authDomain: 'dev-mantic-markets.firebaseapp.com',
    projectId: 'dev-mantic-markets',
    region: 'us-central1',
    storageBucket: 'dev-mantic-markets.appspot.com',
    privateBucket: 'dev-mantic-markets-private',
    messagingSenderId: '134303100058',
    appId: '1:134303100058:web:27f9ea8b83347251f80323',
    measurementId: 'G-YJC9E37P37',
  },
  cloudRunId: 'w3txbmd3ba',
  cloudRunRegion: 'uc',
  amplitudeApiKey: 'fd8cbfd964b9a205b8678a39faae71b3',
  supabaseInstanceId: 'mfodonznyfxllcezufgr',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mb2RvbnpueWZ4bGxjZXp1ZmdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2Njc5ODgxNjcsImV4cCI6MTk4MzU2NDE2N30.RK8CA3G2_yccgiIFoxzweEuJ2XU5SoB7x7wBzMKitvo',
  twitchBotEndpoint: 'https://dev-twitch-bot.manifold.markets',
  apiEndpoint: 'api.dev.manifold.markets',
  expoConfig: {
    iosClientId:
      '134303100058-lioqb7auc8minvqt9iamuit2pg10pubt.apps.googleusercontent.com',
    expoClientId:
      '134303100058-2uvio555s8mnhde20b4old97ptjnji3u.apps.googleusercontent.com',
    androidClientId:
      '134303100058-mu6dbubhks8khpqi3dq0fokqnkbputiq.apps.googleusercontent.com',
  },
  adminIds: [
    'pfKxvtgSEua5DxoIfiPXxR4fAWd2',
    '6hHpzvRG0pMq8PNJs7RZj2qlZGn2',
    '2cO953kN1sTBpfbhPVnTjRNqLJh2', // Sinclair
  ],
}
