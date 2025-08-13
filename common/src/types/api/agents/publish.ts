import { z } from 'zod/v4'

import { DynamicAgentTemplateSchema } from '../../../types/dynamic-agent-template'

export const publishAgentsRequestSchema = z.object({
  data: DynamicAgentTemplateSchema.array(),
  authToken: z.string(),
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
