import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod';

export const OpenRouterErrorResponseSchema = z.object({
  error: z.object({
    code: z.union([z.string(), z.number()]).nullable(),
    message: z.string(),
    type: z.string().nullable(),
    param: z.any().nullable(),
  }),
});

export type OpenRouterErrorData = z.infer<typeof OpenRouterErrorResponseSchema>;

export const openrouterFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: OpenRouterErrorResponseSchema,
  errorToMessage: (data) => data.error.message,
});
