import { z, ZodTypeAny } from 'zod'

function getSchemaDescription(schema: ZodTypeAny): string | undefined {
  return schema.description
}

function formatDescription(description: string | undefined): string {
  return description ? ` (${description})` : ''
}

function indent(level: number): string {
  return '  '.repeat(level)
}

function stringifyZodType(
  schema: ZodTypeAny,
  level: number = 0,
  fieldName?: string
): string {
  const description = getSchemaDescription(schema)
  const baseIndent = indent(level)
  const fieldPrefix = fieldName ? `${fieldName}: ` : ''

  // Handle optional types
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    const innerType = stringifyZodType(schema._def.innerType, level, fieldName)
    // Remove the field name from the inner type string if present
    const innerTypeWithoutPrefix = fieldName
      ? innerType.replace(`${baseIndent}${fieldPrefix}`, `${baseIndent}`)
      : innerType
    return `${baseIndent}${fieldPrefix}Optional<${innerTypeWithoutPrefix.trim()}>${formatDescription(
      description
    )}`
  }

  // Handle default types
  if (schema instanceof z.ZodDefault) {
    const innerType = stringifyZodType(schema._def.innerType, level, fieldName)
    // Remove the field name from the inner type string if present
    const innerTypeWithoutPrefix = fieldName
      ? innerType.replace(`${baseIndent}${fieldPrefix}`, `${baseIndent}`)
      : innerType
    const defaultValue = JSON.stringify(schema._def.defaultValue())
    return `${baseIndent}${fieldPrefix}Default<${innerTypeWithoutPrefix.trim()}> (default: ${defaultValue})${formatDescription(
      description
    )}`
  }

  // Handle object types
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape
    let output = `${baseIndent}${fieldPrefix}Object${formatDescription(description)} {\n`
    for (const key in shape) {
      output += stringifyZodType(shape[key], level + 1, key) + '\n'
    }
    output += `${baseIndent}}`
    return output
  }

  // Handle array types
  if (schema instanceof z.ZodArray) {
    const elementType = stringifyZodType(schema.element, level).trim()
    return `${baseIndent}${fieldPrefix}Array<${elementType}>${formatDescription(description)}`
  }

  // Handle basic types (string, number, boolean, etc.)
  if (schema instanceof z.ZodString) {
    return `${baseIndent}${fieldPrefix}String${formatDescription(description)}`
  }
  if (schema instanceof z.ZodBoolean) {
    return `${baseIndent}${fieldPrefix}Boolean${formatDescription(description)}`
  }
  if (schema instanceof z.ZodNumber) {
    return `${baseIndent}${fieldPrefix}Number${formatDescription(description)}`
  }
  // Add more basic types as needed (e.g., ZodDate, ZodEnum)

  // Fallback for unknown types
  return `${baseIndent}${fieldPrefix}UnknownType${formatDescription(description)}`
}

/**
 * Generates a human-readable string representation of a Zod schema,
 * including descriptions defined using `.describe()`.
 *
 * @param schema The Zod schema object (e.g., z.object({...})).
 * @param schemaName A name for the root schema.
 * @returns A string describing the schema structure and field descriptions.
 */
export function stringifySchemaForLLM(
  schema: z.ZodObject<any>,
  schemaName: string
): string {
  let output = `Schema: ${schemaName}\n`
  output += stringifyZodType(schema)
  return output
}

// --- Example Usage ---
/*
console.log('--- StartupProcessSchema ---')
console.log(stringifySchemaForLLM(StartupProcessSchema, 'StartupProcessSchema'))

console.log('\n--- CodebuffConfigSchema ---')
console.log(stringifySchemaForLLM(CodebuffConfigSchema, 'CodebuffConfigSchema'))
*/
