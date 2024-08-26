import { z } from 'zod'
import { ValidationError } from './_types'

export const validate = <T extends z.ZodTypeAny>(schema: T, val: unknown) => {
  const result = schema.safeParse(val)
  if (!result.success) {
    const issues = result.error.issues.map((i) => {
      return {
        field: i.path.join('.') || null,
        error: i.message,
      }
    })
    throw new ValidationError(issues)
  } else {
    return result.data as z.infer<T>
  }
}
