'use client'

import { CodebuffConfigSchema } from 'common/src/json-config/constants'
import { stringifySchema } from 'common/src/json-config/stringify-schema'

import { CodeDemo } from './code-demo'

export function SchemaDisplay() {
  const schemaString = stringifySchema(CodebuffConfigSchema, 'CodebuffConfigSchema')
  return <CodeDemo language="text">{schemaString}</CodeDemo>
}