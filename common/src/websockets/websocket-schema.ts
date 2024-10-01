import { z } from 'zod'
import { CLIENT_ACTION_SCHEMA, SERVER_ACTION_SCHEMA } from '../actions'

export const CLIENT_MESSAGE_SCHEMAS = {
  identify: z.object({
    type: z.literal('identify'),
    txid: z.number(),
    clientSessionId: z.string(),
  }),
  subscribe: z.object({
    type: z.literal('subscribe'),
    txid: z.number(),
    topics: z.array(z.string()),
  }),
  unsubscribe: z.object({
    type: z.literal('unsubscribe'),
    txid: z.number(),
    topics: z.array(z.string()),
  }),
  ping: z.object({
    type: z.literal('ping'),
    txid: z.number(),
  }),
  action: z.object({
    type: z.literal('action'),
    txid: z.number(),
    data: CLIENT_ACTION_SCHEMA,
  }),
} as const

export const CLIENT_MESSAGE_SCHEMA = z.union([
  CLIENT_MESSAGE_SCHEMAS.identify,
  CLIENT_MESSAGE_SCHEMAS.subscribe,
  CLIENT_MESSAGE_SCHEMAS.unsubscribe,
  CLIENT_MESSAGE_SCHEMAS.ping,
  CLIENT_MESSAGE_SCHEMAS.action,
])

export type ClientMessageType = keyof typeof CLIENT_MESSAGE_SCHEMAS
export type ClientMessage<T extends ClientMessageType = ClientMessageType> =
  z.infer<(typeof CLIENT_MESSAGE_SCHEMAS)[T]>

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
