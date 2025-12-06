import { z } from 'zod/v4'

export const publishAgentsRequestSchema = z.object({
  data: z.record(z.string(), z.any()).array(),
  // DEPRECATED: authToken in body is for backwards compatibility with older CLI versions.
  // New clients should use the Authorization header instead.
  authToken: z.string().optional(),
})
export type PublishAgentsRequest = z.infer<typeof publishAgentsRequestSchema>

export const publishAgentsSuccessResponseSchema = z.object({
  success: z.literal(true),
  publisherId: z.string(),
  agents: z
    .object({
      id: z.string(),
      version: z.string(),
      displayName: z.string(),
    })
    .array(),
})
export type PublishAgentsSuccessResponse = z.infer<
  typeof publishAgentsSuccessResponseSchema
>

export const publishAgentsErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  details: z.string().optional(),
  hint: z.string().optional(),
  availablePublishers: z
    .object({
      id: z.string(),
      name: z.string(),
      ownershipType: z.enum(['user', 'organization']),
      organizationName: z.string().optional(),
    })
    .array()
    .optional(),
  validationErrors: z
    .object({
      code: z.string(),
      message: z.string(),
      path: z.array(z.string()),
    })
    .array()
    .optional(),
})
export type PublishAgentsErrorResponse = z.infer<
  typeof publishAgentsErrorResponseSchema
>

export const publishAgentsResponseSchema = z.discriminatedUnion('success', [
  publishAgentsSuccessResponseSchema,
  publishAgentsErrorResponseSchema,
])
export type PublishAgentsResponse = z.infer<typeof publishAgentsResponseSchema>
