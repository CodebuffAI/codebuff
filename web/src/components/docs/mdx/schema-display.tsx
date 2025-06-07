'use client'

import { CodebuffConfigSchema } from '@codebuff/common/json-config/constants'
import { stringifySchema } from '@codebuff/common/json-config/stringify-schema'

import { CodeDemo } from './code-demo'

export function SchemaDisplay() {
  const schemaString = stringifySchema(CodebuffConfigSchema)
  return <CodeDemo language="json">{schemaString}</CodeDemo>
}
