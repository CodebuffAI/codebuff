import { z, ZodTypeAny } from 'zod'

function getSchemaDescription(schema: ZodTypeAny): string | undefined {
  return schema.description
}

function indent(level: number): string {
  return ' '.repeat(level * 2)
}

function isOptionalType(schema: ZodTypeAny): boolean {
  if (schema instanceof z.ZodOptional) return true
  if (schema instanceof z.ZodNullable && schema._def.innerType instanceof z.ZodOptional) return true
  if (schema instanceof z.ZodDefault && schema._def.innerType instanceof z.ZodOptional) return true
  return false
}

function stringifyZodType(
  schema: ZodTypeAny,
  level: number = 0,
  fieldName?: string,
  needsComma: boolean = false,
  includeDescription: boolean = true
): string {
  const description = includeDescription ? getSchemaDescription(schema) : undefined
  const baseIndent = indent(level)
  const fieldPrefix = fieldName ? `"${fieldName}": ` : ''
  const comma = needsComma ? ',' : ''

  // Handle object types
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape
    let output = ''
    if (description) {
      output += `${baseIndent}// ${description}\n`
    }
    output += `${baseIndent}${fieldPrefix}{\n`
    
    if (Object.keys(shape).length === 0) {
      return output + baseIndent + '}'
    }

    const entries = Object.entries(shape)
    
    entries.forEach(([key, value], index) => {
      const isLastLine = index === entries.length - 1
      const valueDescription = getSchemaDescription(value as ZodTypeAny)
      const isOptional = value instanceof z.ZodOptional || value instanceof z.ZodDefault
      const defaultValue = value instanceof z.ZodDefault ? JSON.stringify(value._def.defaultValue()) : undefined
      
      if (valueDescription) {
        const prefix = isOptional ? '(optional): ' : ''
        const suffix = defaultValue ? `, default: ${defaultValue}` : ''
        // Add newline before comment, but not for first item
        if (index > 0) output += '\n'
        output += `${indent(level + 1)}// ${prefix}${valueDescription}${suffix}\n`
      }
      
      const typeStr = stringifyZodType(value as ZodTypeAny, 0, undefined, false, false)
      output += `${indent(level + 1)}"${key}": ${typeStr}${isLastLine ? '' : ','}\n`
    })

    output += baseIndent + '}'
    return output + (needsComma ? ',' : '')
  }

  // Handle array types
  if (schema instanceof z.ZodArray) {
    let output = ''
    if (description) {
      output += `${baseIndent}// ${description}\n`
    }
    output += `${baseIndent}${fieldPrefix}[\n\n`
    const elementType = schema.element
    if (elementType instanceof z.ZodObject) {
      // For objects, we want the opening brace to be indented two levels
      const objectOutput = stringifyZodType(elementType, level + 2, undefined, false, true)
      output += objectOutput
    } else {
      // For non-objects, we just want the type name
      output += indent(level + 1) + stringifyZodType(elementType, 0, undefined, false, false)
        .trim()
        .replace(/^".*":\s*/, '') // Remove field name if present
    }
    output += `\n${indent(level + 1)}]${comma}`
    return output
  }

  // Handle optional types
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    const innerType = stringifyZodType(schema._def.innerType, level, undefined, false, false)
      .trim()
      .replace(/^".*":\s*/, '') // Remove field name if present
    const nullValue = schema instanceof z.ZodNullable ? 'null' : 'undefined'
    let output = ''
    if (description && includeDescription) {
      output += `${baseIndent}// ${description}\n${baseIndent}`
    }
    return output + `${fieldPrefix}${innerType} | ${nullValue}${comma}`
  }

  // Handle default types
  if (schema instanceof z.ZodDefault) {
    const innerType = stringifyZodType(schema._def.innerType, level, undefined, false, false)
      .trim()
      .replace(/^".*":\s*/, '') // Remove field name if present
    let output = ''
    if (description && includeDescription) {
      output += `${baseIndent}// ${description}\n${baseIndent}`
    }
    return output + `${fieldPrefix}${innerType}${comma}`
  }

  // Handle basic types
  let output = ''
  if (description && includeDescription) {
    output += `${baseIndent}// ${description}\n${baseIndent}`
  }
  if (schema instanceof z.ZodString) {
    return output + `${fieldPrefix}string${comma}`
  }
  if (schema instanceof z.ZodBoolean) {
    return output + `${fieldPrefix}boolean${comma}`
  }
  if (schema instanceof z.ZodNumber) {
    return output + `${fieldPrefix}number${comma}`
  }
  if (schema instanceof z.ZodAny) {
    return output + `${fieldPrefix}any${comma}`
  }

  // Fallback for unknown types
  return output + `${fieldPrefix}unknown${comma}`
}

/**
 * Generates a human-readable string representation of a Zod schema,
 * including descriptions defined using `.describe()`.
 *
 * @param schema The Zod schema object (e.g., z.object({...})).
 * @returns A string describing the schema structure and field descriptions.
 */
export function stringifySchema(schema: z.ZodObject<any>): string {
  return stringifyZodType(schema, 0)
}
