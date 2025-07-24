import z from 'zod/v4'
import { logger } from './logger'

/**
 * Convert a Zod/v4 schema to JSON string representation.
 */
export function schemaToJsonStr(
  schema: z.ZodTypeAny | undefined | Record<string, any>
): string {
  if (!schema) return 'None'

  try {
    // Handle Zod schemas
    if (schema instanceof z.ZodType) {
      const jsonSchema = z.toJSONSchema(schema)
      delete jsonSchema['$schema']
      return JSON.stringify(jsonSchema, null, 2)
    }

    // Otherwise, pass on plain object
    return JSON.stringify(schema, null, 2)
  } catch (error) {
    // Graceful fallback
    logger.warn(
      {
        error,
        schema,
      },
      'Failed to convert schema to JSON'
    )
    return 'None'
  }
}
