import z from 'zod'

import { llmToolCallSchema } from './list'
import { publishedTools } from './constants'

/**
 * Compiles all tool definitions into a single TypeScript definition file content.
 * This generates type definitions for all available tools and their parameters.
 */
export function compileToolDefinitions(): string {
  const toolEntries = publishedTools.map(
    (toolName) => [toolName, llmToolCallSchema[toolName]] as const,
  )

  const toolInterfaces = toolEntries
    .map(([toolName, toolDef]) => {
      const parameterSchema = toolDef.parameters

      // Convert Zod schema to TypeScript interface using JSON schema
      let typeDefinition: string
      try {
        const jsonSchema = z.toJSONSchema(parameterSchema)
        typeDefinition = jsonSchemaToTypeScript(jsonSchema)
      } catch (error) {
        console.warn(`Failed to convert schema for ${toolName}:`, error)
        typeDefinition = '{ [key: string]: any }'
      }

      return `/**
 * ${parameterSchema.description || `Parameters for ${toolName} tool`}
 */
export interface ${toPascalCase(toolName)}Params ${typeDefinition}`
    })
    .join('\n\n')

  const toolUnion = toolEntries.map(([toolName]) => `'${toolName}'`).join(' | ')

  const toolParamsMap = toolEntries
    .map(([toolName]) => `  '${toolName}': ${toPascalCase(toolName)}Params`)
    .join('\n')

  return `/**
 * Union type of all available tool names
 */
export type ToolName = ${toolUnion}

/**
 * Map of tool names to their parameter types
 */
export interface ToolParamsMap {
${toolParamsMap}
}

${toolInterfaces}

/**
 * Get parameters type for a specific tool
 */
export type GetToolParams<T extends ToolName> = ToolParamsMap[T]
`
}

/**
 * Converts kebab-case to PascalCase
 * e.g., 'write-file' -> 'WriteFile'
 */
function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

/**
 * Converts JSON Schema to TypeScript interface definition
 */
function jsonSchemaToTypeScript(schema: any): string {
  if (schema.type === 'object' && schema.properties) {
    const properties = Object.entries(schema.properties).map(
      ([key, prop]: [string, any]) => {
        const isOptional = !schema.required?.includes(key)
        const propType = getTypeFromJsonSchema(prop)
        const comment = prop.description ? `  /** ${prop.description} */\n` : ''
        return `${comment}  "${key}"${isOptional ? '?' : ''}: ${propType}`
      },
    )
    return `{\n${properties.join('\n')}\n}`
  }
  return getTypeFromJsonSchema(schema)
}

/**
 * Gets TypeScript type from JSON Schema property
 */
function getTypeFromJsonSchema(prop: any): string {
  if (prop.type === 'string') {
    if (prop.enum) {
      return prop.enum.map((v: string) => `"${v}"`).join(' | ')
    }
    return 'string'
  }
  if (prop.type === 'number' || prop.type === 'integer') return 'number'
  if (prop.type === 'boolean') return 'boolean'
  if (prop.type === 'array') {
    const itemType = prop.items ? getTypeFromJsonSchema(prop.items) : 'any'
    return `${itemType}[]`
  }
  if (prop.type === 'object') {
    if (prop.properties) {
      return jsonSchemaToTypeScript(prop)
    }
    if (prop.additionalProperties) {
      const valueType = getTypeFromJsonSchema(prop.additionalProperties)
      return `Record<string, ${valueType}>`
    }
    return 'Record<string, any>'
  }
  if (prop.anyOf || prop.oneOf) {
    const schemas = prop.anyOf || prop.oneOf
    return schemas.map((s: any) => getTypeFromJsonSchema(s)).join(' | ')
  }
  return 'any'
}
