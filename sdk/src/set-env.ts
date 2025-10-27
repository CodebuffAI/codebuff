const overrides = {
  OPEN_ROUTER_API_KEY: '',
  RELACE_API_KEY: '',
  LINKUP_API_KEY: '',
  GOOGLE_CLOUD_PROJECT_ID: '',
  PORT: '0',
  DATABASE_URL: '',
  CODEBUFF_GITHUB_ID: '',
  CODEBUFF_GITHUB_SECRET: '',
  NEXTAUTH_SECRET: '',
  STRIPE_SECRET_KEY: '',
  STRIPE_WEBHOOK_SECRET_KEY: '',
  STRIPE_USAGE_PRICE_ID: '',
  STRIPE_TEAM_FEE_PRICE_ID: '',
  LOOPS_API_KEY: '',
  DISCORD_PUBLIC_KEY: '',
  DISCORD_BOT_TOKEN: '',
  DISCORD_APPLICATION_ID: '',
  API_KEY_ENCRYPTION_SECRET: '',
}

export function setEnv(): void {
  if (
    process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev' ||
    process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'test'
  ) {
    return
  }

  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value
  }
}
