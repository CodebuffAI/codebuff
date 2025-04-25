import { TableSchema } from '@google-cloud/bigquery'

interface BaseEvent {
  id: string // primary key, ID for this specific event
  agent_step_id: string // ID for a step of the agent loop, ie: a mainPrompt call
  user_id: string // user ID
}

interface BasePayload {
  user_input_id: string // ID of a given user input in a sesson
  client_session_id: string // ID for a given client session
  fingerprint_id: string // ID for a specific device
}

// Define possible trace types
export type TraceType = 'get-relevant-files' | 'file-trees' | 'agent-response'

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
  cost_mode: string
  model?: string
}

export interface GetRelevantFilesTrace extends BaseTrace {
  type: 'get-relevant-files'
  payload: GetRelevantFilesPayload
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

// Union type for all trace records
export type Trace = GetRelevantFilesTrace | FileTreeTrace | AgentResponseTrace

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
