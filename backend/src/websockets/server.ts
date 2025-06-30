import {
  CLIENT_MESSAGE_SCHEMA,
  ServerMessage,
} from '@codebuff/common/websockets/websocket-schema'
import { isError } from 'lodash'
import { ServerWebSocket } from 'bun'

import { logger } from '../util/logger'
import { Switchboard, ClientState } from './switchboard'
import { onWebsocketAction } from './websocket-action'

export const SWITCHBOARD = new Switchboard()

// if a connection doesn't ping for this long, we assume the other side is toast
const CONNECTION_TIMEOUT_MS = 60 * 1000

export class MessageParseError extends Error {
  details?: unknown
  constructor(message: string, details?: unknown) {
    super(message)
    this.name = 'MessageParseError'
    this.details = details
  }
}

function serializeError(err: unknown) {
  return isError(err) ? err.message : 'Unexpected error.'
}

// Message processing function for Bun ServerWebSocket
export async function processMessage(
  ws: ServerWebSocket<ClientState>,
  clientSessionId: string,
  data: string | Buffer
): Promise<ServerMessage<'ack'>> {
  let messageObj: any
  try {
    messageObj = JSON.parse(data.toString())
  } catch (err) {
    logger.error(
      { err, data },
      'Error parsing message: not valid UTF-8 encoded JSON.'
    )
    return { type: 'ack', success: false, error: serializeError(err) }
  }

  try {
    const msg = CLIENT_MESSAGE_SCHEMA.parse(messageObj)
    const { type, txid } = msg
    switch (type) {
      case 'subscribe': {
        SWITCHBOARD.subscribe(ws, ...msg.topics)
        break
      }
      case 'unsubscribe': {
        SWITCHBOARD.unsubscribe(ws, ...msg.topics)
        break
      }
      case 'ping': {
        SWITCHBOARD.markSeen(ws)
        break
      }
      case 'action': {
        onWebsocketAction(ws, clientSessionId, msg)
        break
      }
      default:
        throw new Error("Unknown message type; shouldn't be possible here.")
    }
    return { type: 'ack', txid, success: true }
  } catch (err) {
    logger.error({ err }, 'Error processing message')
    return {
      type: 'ack',
      txid: messageObj.txid,
      success: false,
      error: serializeError(err),
    }
  }
}

// Bun-specific connection cleaner
let deadConnectionCleaner: Timer | undefined

export function startConnectionCleaner() {
  if (!deadConnectionCleaner) {
    deadConnectionCleaner = setInterval(() => {
      const now = Date.now()
      try {
        for (const [ws, client] of SWITCHBOARD.clients.entries()) {
          try {
            const lastSeen = client.lastSeen
            if (lastSeen < now - CONNECTION_TIMEOUT_MS) {
              ws.close(1000, 'Connection timeout')
            }
          } catch (err) {
            // logger.error(
            //   { error: err },
            //   'Error checking individual connection in deadConnectionCleaner'
            // )
          }
        }
      } catch (error) {
        logger.error({ error }, 'Error in deadConnectionCleaner outer loop')
      }
    }, CONNECTION_TIMEOUT_MS)
  }
}

export function stopConnectionCleaner() {
  if (deadConnectionCleaner) {
    clearInterval(deadConnectionCleaner)
    deadConnectionCleaner = undefined
  }
}

// Message sending function for Bun ServerWebSocket
export const sendMessage = (ws: ServerWebSocket<ClientState>, server: ServerMessage) => {
  ws.send(JSON.stringify(server))
}

export function sendRequestReconnect() {
  for (const ws of SWITCHBOARD.clients.keys()) {
    sendMessage(ws, { type: 'action', data: { type: 'request-reconnect' } })
  }
}

export function waitForAllClientsDisconnected() {
  return SWITCHBOARD.waitForAllClientsDisconnected()
}
