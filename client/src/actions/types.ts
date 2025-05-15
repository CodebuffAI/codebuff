import { z } from 'zod'
import {
  CLIENT_MESSAGE_SCHEMA,
  SERVER_MESSAGE_SCHEMA,
  ClientMessage,
  ServerMessage,
  ClientMessageType,
  ServerMessageType
} from 'common/websockets/websocket-schema'
import {
  ClientAction,
  ServerAction,
  CLIENT_ACTION_SCHEMA,
  SERVER_ACTION_SCHEMA
} from 'common/actions'

export {
  CLIENT_MESSAGE_SCHEMA,
  SERVER_MESSAGE_SCHEMA,
  CLIENT_ACTION_SCHEMA,
  SERVER_ACTION_SCHEMA
}

export type {
  ClientMessage,
  ServerMessage,
  ClientMessageType,
  ServerMessageType,
  ClientAction,
  ServerAction
}

let nextTxId = 1;
export const getNextTxId = () => nextTxId++;