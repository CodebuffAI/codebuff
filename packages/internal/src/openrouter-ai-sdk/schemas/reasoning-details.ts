import { z } from 'zod/v4'

export enum ReasoningDetailType {
  Summary = 'reasoning.summary',
  Encrypted = 'reasoning.encrypted',
  Text = 'reasoning.text',
}

export const ReasoningDetailSummarySchema = z.object({
  type: z.literal(ReasoningDetailType.Summary),
  summary: z.string(),
})
export type ReasoningDetailSummary = z.infer<
  typeof ReasoningDetailSummarySchema
>

export const ReasoningDetailEncryptedSchema = z.object({
  type: z.literal(ReasoningDetailType.Encrypted),
  data: z.string(),
})
export type ReasoningDetailEncrypted = z.infer<
  typeof ReasoningDetailEncryptedSchema
>

export const ReasoningDetailTextSchema = z.object({
  type: z.literal(ReasoningDetailType.Text),
  text: z.string().nullish(),
  signature: z.string().nullish(),
})

export type ReasoningDetailText = z.infer<typeof ReasoningDetailTextSchema>

export const ReasoningDetailUnionSchema = z.union([
  ReasoningDetailSummarySchema,
  ReasoningDetailEncryptedSchema,
  ReasoningDetailTextSchema,
])

const ReasoningDetailsWithUnknownSchema = z.union([
  ReasoningDetailUnionSchema,
  z.unknown().transform(() => null),
])

export type ReasoningDetailUnion = z.infer<typeof ReasoningDetailUnionSchema>

export const ReasoningDetailArraySchema = z
  .array(ReasoningDetailsWithUnknownSchema)
  .transform((d) => d.filter((d): d is ReasoningDetailUnion => !!d))
