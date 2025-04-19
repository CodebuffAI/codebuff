import { TableSchema } from '@google-cloud/bigquery'

interface BaseEvent {
  id: string // primary key, ID for this specific event
  agentStepId: string // ID for a step of the agent loop, ie: a mainPrompt call
}

interface BasePayload {
  userInputId: string // ID of a given user input in a sesson
  clientSessionId: string // ID for a given client session
  fingerprintId: string // ID for a specific device
  userId: string // user ID
}

// Define possible trace types
export type TraceType = 'get-relevant-files' | 'file-trees' | 'agent-response'

// Base trace interface
export interface BaseTrace extends BaseEvent {
  createdAt: Date
  type: TraceType
  payload: unknown
}

// Type-specific payload interfaces
interface GetRelevantFilesPayload extends BasePayload {
  messages: unknown
  system: unknown
  output: string
  requestType: string
  costMode: string
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
    { name: 'agentStepId', type: 'STRING', mode: 'REQUIRED' }, // Used to link traces together within a single agent step
    { name: 'createdAt', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'type', type: 'STRING', mode: 'REQUIRED' },
    { name: 'payload', type: 'JSON', mode: 'REQUIRED' },
  ],
}

interface RelabelPayload extends BasePayload {
  output: string
}

export interface Relabel extends BaseEvent {
  createdAt: Date
  model: string
  payload: RelabelPayload
}

export const RELABELS_SCHEMA: TableSchema = {
  fields: [
    { name: 'id', type: 'STRING', mode: 'REQUIRED' }, // UUID
    { name: 'agentStepId', type: 'STRING', mode: 'REQUIRED' }, // Used to link traces together within a single agent step
    { name: 'createdAt', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'model', type: 'STRING', mode: 'REQUIRED' },
    { name: 'payload', type: 'JSON', mode: 'REQUIRED' },
  ],
}
