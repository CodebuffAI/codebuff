import { z } from 'zod/v4'

import { SERVER_ACTION_SCHEMA } from '../actions'

import type { ClientAction } from '../actions'

type ClientMessageIdentify = {
  type: 'identify'
  txid: number
  clientSessionId: string
}
type ClientMessageSubscribe = {
  type: 'subscribe'
  txid: number
  topics: string[]
}
type ClientMessageUnsubscribe = {
  type: 'unsubscribe'
  txid: number
  topics: string[]
}
type ClientMessagePing = {
  type: 'ping'
  txid: number
}
type ClientMessageAction = {
  type: 'action'
  txid: number
  data: ClientAction
}

export type ClientMessageType =
  | 'identify'
  | 'subscribe'
  | 'unsubscribe'
  | 'ping'
  | 'action'
export type ClientMessage<T extends ClientMessageType = ClientMessageType> = {
  identify: ClientMessageIdentify
  subscribe: ClientMessageSubscribe
  unsubscribe: ClientMessageUnsubscribe
  ping: ClientMessagePing
  action: ClientMessageAction
}[T]

export const SERVER_MESSAGE_SCHEMAS = {
  ack: z.object({
    type: z.literal('ack'),
    txid: z.number().optional(),
    success: z.boolean(),
    error: z.string().optional(),
  }),
  action: z.object({
    type: z.literal('action'),
    data: SERVER_ACTION_SCHEMA,
  }),
}

export const SERVER_MESSAGE_SCHEMA = z.union([
  SERVER_MESSAGE_SCHEMAS.ack,
  SERVER_MESSAGE_SCHEMAS.action,
])

export type ServerMessageType = keyof typeof SERVER_MESSAGE_SCHEMAS
export type ServerMessage<T extends ServerMessageType = ServerMessageType> =
  z.infer<(typeof SERVER_MESSAGE_SCHEMAS)[T]>
