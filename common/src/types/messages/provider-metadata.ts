import z from 'zod/v4'

import { jsonValueSchema, type JSONValue } from '../json'

export type ProviderMetadata = Record<
  string,
  Record<string, JSONValue | undefined>
>

export const providerMetadataSchema: z.ZodType<ProviderMetadata> = z.record(
  z.string(),
  z.record(z.string(), jsonValueSchema.optional()),
)
