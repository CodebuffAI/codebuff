// GitHub App Configuration
export const GITHUB_APP_CONFIG = {
  APP_ID: process.env.GITHUB_APP_ID!,
  APP_SLUG: process.env.GITHUB_APP_SLUG!, // GitHub App slug - matches the organization name
} as const;
