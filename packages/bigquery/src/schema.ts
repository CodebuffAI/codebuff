import type { TableSchema } from '@google-cloud/bigquery'

interface BaseEvent {
  id: string // primary key, ID for this specific event
  agent_step_id: string // ID for a step of the agent loop, ie: a mainPrompt call
  user_id: string // user ID
}

interface BasePayload {
  user_input_id: string // ID of a given user input in a session
  client_session_id: string // ID for a given client session
  fingerprint_id: string // ID for a specific device
}

// Define possible trace types
export type TraceType =
  | 'get-relevant-files' // Get-relevant-files call in production
  | 'file-trees' // Uploads additional file trees of various sizes
  | 'agent-response' // Response from the agent at the end
  | 'get-expanded-file-context-for-training' // Additional capture of a stronger-model + higher-file limit call
  | 'get-expanded-file-context-for-training-blobs' // Capture of full file context from get-relevant-files-for-training call
  | 'grade-run' // Run grades (by a judge model)

// Base trace interface
export interface BaseTrace extends BaseEvent {
  created_at: Date
  type: TraceType
  payload: unknown
}

// Type-specific payload interfaces
export interface GetRelevantFilesPayload extends BasePayload {
  messages: unknown
  system: unknown
  output: string
  request_type: string
  model?: string
  repo_name?: string
}

export interface GetRelevantFilesTrace extends BaseTrace {
  type: 'get-relevant-files'
  payload: GetRelevantFilesPayload
}

export interface GetExpandedFileContextForTrainingTrace extends BaseTrace {
  type: 'get-expanded-file-context-for-training'
  payload: GetRelevantFilesPayload
}

export interface FilesBlobPayload extends BasePayload {
  files: Record<string, { content: string; tokens: number }>
}

export interface GetExpandedFileContextForTrainingBlobTrace extends BaseTrace {
  type: 'get-expanded-file-context-for-training-blobs'
  payload: FilesBlobPayload
}

interface FileTreePayload extends BasePayload {
  filetrees: Record<number, string>
}

export interface FileTreeTrace extends BaseTrace {
  type: 'file-trees'
  payload: FileTreePayload
}

interface AgentResponsePayload extends BasePayload {
  output: string
}

export interface AgentResponseTrace extends BaseTrace {
  type: 'agent-response'
  payload: AgentResponsePayload
}

interface GradeRunPayload extends BasePayload {
  type: 'grade-run'
  scores: string // Of format: [{model_name: "foo", score: 4}, {model_name: "bar", score: 3}, {model_name: "baz", score: 3}]
}

export interface GradeRunTrace extends BaseTrace {
  type: 'grade-run'
  payload: GradeRunPayload
}

// Union type for all trace records
export type Trace =
  | GetRelevantFilesTrace
  | FileTreeTrace
  | AgentResponseTrace
  | GetExpandedFileContextForTrainingBlobTrace
  | GetExpandedFileContextForTrainingTrace
  | GradeRunTrace

export const TRACES_SCHEMA: TableSchema = {
  fields: [
    { name: 'id', type: 'STRING', mode: 'REQUIRED' }, // UUID
    { name: 'agent_step_id', type: 'STRING', mode: 'REQUIRED' }, // Used to link traces together within a single agent step
    { name: 'user_id', type: 'STRING', mode: 'REQUIRED' }, // user ID
    { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'type', type: 'STRING', mode: 'REQUIRED' },
    { name: 'payload', type: 'JSON', mode: 'REQUIRED' },
  ],
}

interface RelabelPayload extends BasePayload {
  output: string
}

export interface Relabel extends BaseEvent {
  created_at: Date
  model: string
  payload: RelabelPayload
}

export const RELABELS_SCHEMA: TableSchema = {
  fields: [
    { name: 'id', type: 'STRING', mode: 'REQUIRED' }, // UUID
    { name: 'agent_step_id', type: 'STRING', mode: 'REQUIRED' }, // Used to link traces together within a single agent step
    { name: 'user_id', type: 'STRING', mode: 'REQUIRED' }, // user ID
    { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'model', type: 'STRING', mode: 'REQUIRED' },
    { name: 'payload', type: 'JSON', mode: 'REQUIRED' },
  ],
}

export const MESSAGE_SCHEMA: TableSchema = {
  fields: [
    { name: 'id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'user_id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'finished_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'request', type: 'JSON', mode: 'REQUIRED' },
    { name: 'response', type: 'STRING', mode: 'REQUIRED' },
    { name: 'output_tokens', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'reasoning_text', type: 'STRING', mode: 'NULLABLE' },
    { name: 'reasoning_tokens', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'cost', type: 'FLOAT', mode: 'NULLABLE' },
    { name: 'upstream_inference_cost', type: 'FLOAT', mode: 'NULLABLE' },
    { name: 'input_tokens', type: 'INTEGER', mode: 'NULLABLE' },
    { name: 'cache_read_input_tokens', type: 'INTEGER', mode: 'NULLABLE' },
  ],
}
