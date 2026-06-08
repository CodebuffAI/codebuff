import z from 'zod/v4'

import { publishedTools } from './constants'
import { toolParams } from './list'

/** A tool name plus the Zod schema describing its parameters. */
export interface ToolSchemaEntry {
  /** Snake_case tool name, e.g. 'web_search'. */
  name: string
  /** Zod schema for the tool's parameters. */
  inputSchema: z.ZodType
}

/** The published tools and their parameter schemas, in published order. */
function getPublishedToolEntries(): ToolSchemaEntry[] {
  return publishedTools.map((toolName) => ({
    name: toolName,
    inputSchema: toolParams[toolName].inputSchema,
  }))
}

/**
 * Compiles tool definitions into a single TypeScript definition file content.
 * This generates type definitions for the given tools and their parameters.
 *
 * Defaults to every published tool; callers (e.g. tests) may pass an explicit
 * list to compile definitions for a specific set of schemas instead.
 */
export function compileToolDefinitions(
  tools: ToolSchemaEntry[] = getPublishedToolEntries(),
): string {
  const toolInterfaces = tools
    .map(({ name: toolName, inputSchema: parameterSchema }) => {
      // Convert Zod schema to TypeScript interface using JSON schema
      let typeDefinition: string
      let jsonSchema: unknown
      try {
        jsonSchema = z.toJSONSchema(parameterSchema, { io: 'input' })
        typeDefinition = jsonSchemaToTypeScript(jsonSchema)
      } catch (error) {
        console.warn(`Failed to convert schema for ${toolName}:`, error)
        typeDefinition = '{ [key: string]: any }'
      }

      const typeName = `${toPascalCase(toolName)}Params`
      const declaration = canEmitInterface(jsonSchema)
        ? `export interface ${typeName} ${typeDefinition}`
        : `export type ${typeName} = ${typeDefinition}`

      return `/**
 * ${parameterSchema.description || `Parameters for ${toolName} tool`}
 */
${declaration}`
    })
    .join('\n\n')

  const toolUnion = tools.map(({ name }) => `'${name}'`).join(' | ')

  const toolParamsMap = tools
    .map(({ name }) => `  '${name}': ${toPascalCase(name)}Params`)
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

function canEmitInterface(schema: any): boolean {
  return (
    schema.type === 'object' &&
    !!schema.properties &&
    !schema.anyOf &&
    !schema.oneOf
  )
}

/**
 * Gets TypeScript type from JSON Schema property
 */
function getTypeFromJsonSchema(prop: any): string {
  if (prop.const !== undefined) {
    return JSON.stringify(prop.const)
  }

  if (prop.type === 'string') {
    if (prop.enum) {
      return prop.enum.map((v: string) => JSON.stringify(v)).join(' | ')
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
