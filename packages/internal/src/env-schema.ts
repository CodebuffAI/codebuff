import { clientEnvSchema, clientProcessEnv } from '@codebuff/common/env-schema'
import z from 'zod/v4'

export const serverEnvSchema = clientEnvSchema.extend({
  // LLM API keys
  OPEN_ROUTER_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  FIREWORKS_API_KEY: z.string().min(1),
  MOONSHOT_API_KEY: z.string().min(1).optional(),
  CANOPYWAVE_API_KEY: z.string().min(1).optional(),
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  SILICONFLOW_API_KEY: z.string().min(1).optional(),
  OPENCODE_API_KEY: z.string().min(1).optional(),
  LINKUP_API_KEY: z.string().min(1),
  CONTEXT7_API_KEY: z.string().optional(),
  GRAVITY_API_KEY: z.string().min(1),
  IPINFO_TOKEN: z.string().min(1),
  PORT: z.coerce.number().min(1000),
})
export const serverEnvVars = serverEnvSchema.keyof().options
export type ServerEnvVar = (typeof serverEnvVars)[number]
export type ServerInput = {
  [K in (typeof serverEnvVars)[number]]: string | undefined
}
export type ServerEnv = z.infer<typeof serverEnvSchema>

// CI-only env vars that are NOT in the typed schema
export const ciOnlyEnvVars = [] as const
export type CiOnlyEnvVar = (typeof ciOnlyEnvVars)[number]

// Bun will inject all these values, so we need to reference them individually (no for-loops)
export const serverProcessEnv: ServerInput = {
  ...clientProcessEnv,

  // LLM API keys
  OPEN_ROUTER_API_KEY: process.env.OPEN_ROUTER_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  FIREWORKS_API_KEY: process.env.FIREWORKS_API_KEY,
  MOONSHOT_API_KEY: process.env.MOONSHOT_API_KEY,
  CANOPYWAVE_API_KEY: process.env.CANOPYWAVE_API_KEY,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  SILICONFLOW_API_KEY: process.env.SILICONFLOW_API_KEY,
  OPENCODE_API_KEY: process.env.OPENCODE_API_KEY,
  LINKUP_API_KEY: process.env.LINKUP_API_KEY,
  CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY,
  GRAVITY_API_KEY: process.env.GRAVITY_API_KEY,
  IPINFO_TOKEN: process.env.IPINFO_TOKEN,
  PORT: process.env.PORT,
}
