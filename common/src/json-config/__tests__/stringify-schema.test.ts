// @ts-ignore
import { describe, expect, it } from 'bun:test'
import { z } from 'zod'

import { CodebuffConfigSchema, StartupProcessSchema } from '../constants'
import { stringifySchema } from '../stringify-schema'

describe('stringifySchema', () => {
  it('should correctly stringify StartupProcessSchema', () => {
    const result = stringifySchema(StartupProcessSchema)
    expect(result).toMatchSnapshot()
  })

  it('should correctly stringify CodebuffConfigSchema', () => {
    const result = stringifySchema(CodebuffConfigSchema)
    expect(result).toMatchSnapshot()
  })

  it('should handle a more complex schema', () => {
    const ComplexSchema = z
      .object({
        id: z.string().describe('Unique identifier'),
        count: z.number().int().positive().describe('A positive integer count'),
        isActive: z.boolean().describe('Activity status'),
        tags: z.array(z.string()).optional().describe('Optional list of tags'),
        nested: z
          .object({
            value: z.string(),
            config: z
              .object({
                retries: z.number().default(3).describe('Number of retries'),
              })
              .describe('Nested configuration'),
          })
          .describe('A nested object structure'),
      })
      .describe('A complex test schema')

    const result = stringifySchema(ComplexSchema)
    expect(result).toMatchSnapshot()
  })

  it('should handle an empty object schema', () => {
    const EmptySchema = z.object({}).describe('An empty schema')
    const result = stringifySchema(EmptySchema)
    expect(result).toMatchSnapshot()
  })

  it('should handle schema with only optional fields', () => {
    const OptionalOnlySchema = z
      .object({
        field1: z.string().optional().describe('Optional field 1'),
        field2: z.number().optional().describe('Optional field 2'),
      })
      .describe('Schema with only optional fields')
    const result = stringifySchema(OptionalOnlySchema)
    expect(result).toMatchSnapshot()
  })

  it('should handle schema with default values', () => {
    const DefaultSchema = z
      .object({
        name: z.string().default('anonymous').describe('Name with default'),
        level: z.number().default(1).describe('Level with default'),
        enabled: z.boolean().default(false).describe('Enabled with default'),
      })
      .describe('Schema demonstrating default values')
    const result = stringifySchema(DefaultSchema)
    expect(result).toMatchSnapshot()
  })
})
