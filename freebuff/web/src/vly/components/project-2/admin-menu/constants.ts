export const CREDIT_TYPES = [
  { id: "agent_credits", name: "Agent Credits" },
  { id: "email_integration", name: "Email Credits" },
  { id: "llm_integration", name: "AI Credits" },
  { id: "convex_function_calls", name: "Convex Function Calls" },
  { id: "convex_compute", name: "Convex Compute (GB-h)" },
  { id: "convex_database_bw", name: "Convex Database Bandwidth (GB)" },
  { id: "convex_file_bw", name: "Convex File Bandwidth (GB)" },
] as const;

export const CREDIT_NAME_ABBREVIATIONS: Record<string, string> = {
  agent_credits: "Agent",
  email_integration: "Email",
  llm_integration: "AI",
  convex_function_calls: "Calls",
  convex_compute: "Compute",
  convex_database_bw: "DB BW",
  convex_file_bw: "File BW",
};

export const CREDIT_UNITS: Record<string, string> = {
  convex_compute: "GB-h",
  convex_database_bw: "GB",
  convex_file_bw: "GB",
};

export const CREDIT_INCREMENTS: Record<
  string,
  { label: string; value: number }[]
> = {
  agent_credits: [
    { label: "1M", value: 1000000 },
    { label: "10M", value: 10000000 },
    { label: "100M", value: 100000000 },
  ],
  email_integration: [
    { label: "1", value: 1 },
    { label: "10", value: 10 },
    { label: "100", value: 100 },
  ],
  llm_integration: [
    { label: "10", value: 10 },
    { label: "100", value: 100 },
    { label: "1K", value: 1000 },
  ],
  convex_function_calls: [
    { label: "10K", value: 10000 },
    { label: "100K", value: 100000 },
    { label: "1M", value: 1000000 },
  ],
  convex_compute: [
    { label: "1", value: 1 },
    { label: "10", value: 10 },
    { label: "100", value: 100 },
  ],
  convex_database_bw: [
    { label: "1", value: 1 },
    { label: "10", value: 10 },
    { label: "100", value: 100 },
  ],
  convex_file_bw: [
    { label: "1", value: 1 },
    { label: "10", value: 10 },
    { label: "100", value: 100 },
  ],
};

export const CREDIT_INPUT_UNITS: Record<string, string> = {
  agent_credits: "credits",
  email_integration: "emails",
  llm_integration: "credits",
  convex_function_calls: "calls",
  convex_compute: "GB-h",
  convex_database_bw: "GB",
  convex_file_bw: "GB",
};

export const DEFAULT_FLAGS = [
  {
    key: "billing_enforcement",
    description: "Enforce billing limits and restrictions",
    defaultStrategy: "disabled" as const,
    categories: ["Billing"],
  },
  {
    key: "billing_page_enabled",
    description: "Show billing page in navigation menu",
    defaultStrategy: "god_only" as const,
    categories: ["Billing", "UI"],
  },
  {
    key: "vly_integrations_enabled",
    description: "Enable Freebuff Web platform integrations",
    defaultStrategy: "disabled" as const,
    categories: ["Features"],
  },
  {
    key: "organizations_enabled",
    description: "Enable organization features",
    defaultStrategy: "disabled" as const,
    categories: ["Features"],
  },
  {
    key: "referrals_enabled",
    description: "Enable referral program",
    defaultStrategy: "disabled" as const,
    categories: ["Features", "UI"],
  },
  {
    key: "usage_tab_enabled",
    description: "Usage and monitoring tab in project sidebar",
    defaultStrategy: "disabled" as const,
    categories: ["Features", "UI"],
  },
  {
    key: "stats_monitoring_enabled",
    description: "Enable sandbox stats monitoring and Axiom queries",
    defaultStrategy: "disabled" as const,
    categories: ["Monitoring", "Features"],
  },
] as const;

export const CATEGORY_RUNBOOKS: Record<string, string> = {
  Billing: `# Billing Feature Flags

These flags control billing-related features and enforcement.

## Rollout Guidelines
- Test in god_only first
- Validate with beta users before broader rollout
- Monitor billing webhook logs after enabling

## Important Notes
- \`billing_enforcement\` should remain disabled until payment processing is fully tested
- \`billing_page_enabled\` controls visibility only, not functionality`,

  Integrations: `# Integration Feature Flags

Controls external platform integrations.

## Rollout Guidelines
- Verify API credentials before enabling
- Test with small percentage rollout first
- Monitor integration logs for errors`,

  Features: `# Feature Flags

Major product features that may need gradual rollout.

## Rollout Guidelines
- Use beta strategy for new features
- Gather feedback before full rollout
- Consider percentage-based rollout for high-risk features`,

  UI: `# UI Feature Flags

Controls visibility of UI elements and pages.

## Rollout Guidelines
- Safe to enable immediately if UI is ready
- Consider user feedback on UI changes
- Can use percentage rollout for A/B testing`,

  Monitoring: `# Monitoring Feature Flags

Controls monitoring, observability, and stats collection features.

## Rollout Guidelines
- Start with god_only to verify data collection is working
- Monitor Axiom query costs before broad rollout
- Consider disabling if seeing performance issues

## Important Notes
- \`stats_monitoring_enabled\` controls both daemon installation and Axiom queries
- Disabling this flag will stop stats collection and save on Axiom costs
- Safe to enable for select users via percentage rollout`,
};

export const STRATEGY_LABELS = {
  disabled: "Disabled",
  god_only: "God Only",
  beta: "Beta",
  percentage: "Percentage",
  enabled: "Enabled",
} as const;

export const STRATEGY_DESCRIPTIONS = {
  disabled: "Off for everyone",
  god_only: "God role only",
  beta: "God + Beta users",
  percentage: "God + Beta + % of users",
  enabled: "On for everyone",
} as const;

export const PAUSE_REASON_LABELS: Record<string, string> = {
  manual_admin: "Manual Admin",
  db_bandwidth_depleted: "DB Bandwidth Depleted",
  compute_depleted: "Compute Depleted",
  db_storage_depleted: "DB Storage Depleted",
  file_bandwidth_depleted: "File Bandwidth Depleted",
  function_calls_depleted: "Function Calls Depleted",
};
