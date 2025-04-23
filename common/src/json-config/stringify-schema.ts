import { z, ZodTypeAny } from 'zod'

function getSchemaDescription(schema: ZodTypeAny): string | undefined {
  return schema.description
}

function formatDescription(description: string | undefined): string {
  if (!description) return ''
  return `(${description})`
}

function indent(level: number): string {
  return ' '.repeat(level)
}

function stringifyZodType(
  schema: ZodTypeAny,
  level: number = 0,
  fieldName?: string
): string {
  const description = getSchemaDescription(schema)
  const baseIndent = indent(level)
  const fieldPrefix = fieldName ? `\`${fieldName}\`:` : ''
  const desc = formatDescription(description)

  // Handle object types
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape
    let output = `${baseIndent}${fieldPrefix}`
    if (desc) output += `\n${indent(level + 1)}${desc}`
    output += `\n${indent(level + 1)}Object`
    if (Object.keys(shape).length === 0) {
      output += `\n${baseIndent}{\n${baseIndent}}`
      return output
    }
    output += `\n${baseIndent}{\n`
    for (const key in shape) {
      output += stringifyZodType(shape[key], level + 1, key) + '\n\n'
    }
    output = output.slice(0, -1) // Remove last newline
    output += `${baseIndent}}`
    return output
  }

  // Handle optional types
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    const innerType = stringifyZodType(schema._def.innerType, level, fieldName)
    // Remove the field name from the inner type string if present
    const innerTypeWithoutPrefix = fieldName
      ? innerType.replace(`${baseIndent}\`${fieldName}\`:`, `${baseIndent}`)
      : innerType
    return `${baseIndent}${fieldPrefix}\n${indent(level + 1)}${desc}\n${indent(level + 1)}Optional<${innerTypeWithoutPrefix.trim()}>`
  }

  // Handle default types
  if (schema instanceof z.ZodDefault) {
    const innerType = stringifyZodType(schema._def.innerType, level, fieldName)
    // Remove the field name from the inner type string if present
    const innerTypeWithoutPrefix = fieldName
      ? innerType.replace(`${baseIndent}\`${fieldName}\`:`, `${baseIndent}`)
      : innerType
    const defaultValue = JSON.stringify(schema._def.defaultValue())
    return [
      `${baseIndent}${fieldPrefix}`,
      `${indent(level + 1)}${desc}`,
      `${indent(level + 1)}${innerTypeWithoutPrefix.trim()} (default: ${defaultValue})`,
    ].join('\n')
  }

  // Handle array types
  if (schema instanceof z.ZodArray) {
    const elementType = stringifyZodType(
      schema.element,
      level + 2,
      `${fieldName}.item`
    ).trim()
    return [
      `${baseIndent}${fieldPrefix}`,
      `${indent(level + 1)}${desc}`,
      `${indent(level + 1)}Array<`,
      `${indent(level + 2)}${elementType}`,
      `${indent(level + 1)}>`,
    ].join('\n')
  }

  // Handle basic types (string, number, boolean, etc.)
  if (schema instanceof z.ZodString) {
    return `${baseIndent}${fieldPrefix}\n${indent(level + 1)}${desc}\n${indent(level + 1)}String`
  }
  if (schema instanceof z.ZodBoolean) {
    return `${baseIndent}${fieldPrefix}\n${indent(level + 1)}${desc}\n${indent(level + 1)}Boolean`
  }
  if (schema instanceof z.ZodNumber) {
    return `${baseIndent}${fieldPrefix}\n${indent(level + 1)}${desc}\n${indent(level + 1)}Number`
  }
  if (schema instanceof z.ZodAny) {
    return `${baseIndent}${fieldPrefix}\n${indent(level + 1)}${desc}\n${indent(level + 1)}Any`
  }
  // Add more basic types as needed (e.g., ZodDate, ZodEnum)

  // Fallback for unknown types
  return `${baseIndent}${fieldPrefix}\n${indent(level + 1)}${desc}\n${indent(level + 1)}UnknownType`
}

/**
 * Generates a human-readable string representation of a Zod schema,
 * including descriptions defined using `.describe()`.
 *
 * @param schema The Zod schema object (e.g., z.object({...})).
 * @param schemaName A name for the root schema.
 * @returns A string describing the schema structure and field descriptions.
 */
export function stringifySchema(
  schema: z.ZodObject<any>,
  schemaName: string
): string {
  return stringifyZodType(schema, 0, schemaName)
}
