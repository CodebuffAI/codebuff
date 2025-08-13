'use client'

import { CodebuffConfigSchema } from '@codebuff/common/json-config/constants'
import { schemaToJsonStr } from '@codebuff/common/util/zod-schema'
import { DynamicAgentTemplateSchema } from '@codebuff/common/types/dynamic-agent-template'

import { CodeDemo } from './code-demo'

export function SchemaDisplay() {
  const schemaString = schemaToJsonStr(CodebuffConfigSchema, {io: 'input'})
  return <CodeDemo language="json">{schemaString}</CodeDemo>
}

export function AgentTemplateSchemaDisplay() {
  const schemaString = schemaToJsonStr(DynamicAgentTemplateSchema, {io: 'input'})
  return <CodeDemo language="json">{schemaString}</CodeDemo>
}
