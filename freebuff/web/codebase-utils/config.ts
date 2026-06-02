// Shared configuration for codebase-utils
// Note: Installation ID is not included here as it's dynamic per installation
// and should be passed as a parameter to functions that need it
export const GITHUB_APP_CONFIG = {
  APP_ID: process.env.GITHUB_APP_ID!,
  ORGANIZATION: process.env.GITHUB_APP_SLUG!,
} as const;
