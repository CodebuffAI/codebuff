import type { Logger } from './logger'

export type MessageRow = {
  id: string
  user_id: string
  finished_at: Date
  created_at: Date
  request: unknown
  reasoning_text: string
  response: string
  output_tokens?: number | null
  reasoning_tokens?: number | null
  cost?: number | null
  upstream_inference_cost?: number | null
  input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

export type InsertMessageBigqueryFn = (params: {
  row: MessageRow
  dataset?: string
  logger: Logger
}) => Promise<boolean>
