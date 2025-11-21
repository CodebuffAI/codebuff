import type { ClientAction, ServerAction } from '../actions'

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

type ClientMessageAny =
  | ClientMessageIdentify
  | ClientMessageSubscribe
  | ClientMessageUnsubscribe
  | ClientMessagePing
  | ClientMessageAction
export type ClientMessageType = ClientMessageAny['type']
export type ClientMessage<T extends ClientMessageType = ClientMessageType> = {
  [K in ClientMessageType]: Extract<
    ClientMessageAny,
    {
      type: K
    }
  >
}[T]

type ServerMessageAck = {
  type: 'ack'
  txid?: number
  success: boolean
  error?: string
}

type ServerMessageAction = {
  type: 'action'
  data: ServerAction
}

type ServerMessageAny = ServerMessageAck | ServerMessageAction
export type ServerMessageType = ServerMessageAny['type']
export type ServerMessage<T extends ServerMessageType = ServerMessageType> = {
  [K in ServerMessageType]: Extract<
    ServerMessageAny,
    {
      type: K
    }
  >
}[T]
