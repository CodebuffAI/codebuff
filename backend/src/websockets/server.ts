import { ASYNC_AGENTS_ENABLED } from '@codebuff/common/old-constants'
import { CLIENT_MESSAGE_SCHEMA } from '@codebuff/common/websockets/websocket-schema'
import { isError } from 'lodash'
import { WebSocketServer } from 'ws'

import { asyncAgentManager } from '../async-agent-manager'
import { setSessionConnected } from '../live-user-inputs'
import { Switchboard } from './switchboard'
import { onWebsocketAction } from './websocket-action'
import { logger } from '../util/logger'

import type { ServerMessage } from '@codebuff/common/websockets/websocket-schema'
import type { Server as HttpServer } from 'node:http'
import type { RawData, WebSocket } from 'ws'

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

async function processMessage(
  ws: WebSocket,
  clientSessionId: string,
  data: RawData,
): Promise<ServerMessage<'ack'>> {
  let messageObj: any
  try {
    messageObj = JSON.parse(data.toString())
  } catch (err) {
    logger.error(
      { err, data },
      'Error parsing message: not valid UTF-8 encoded JSON.',
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

export function listen(server: HttpServer, path: string) {
  const wss = new WebSocketServer({ server, path })
  let deadConnectionCleaner: NodeJS.Timeout | undefined
  wss.on('listening', () => {
    logger.info(`Web socket server listening on ${path}.`)
    deadConnectionCleaner = setInterval(function ping() {
      const now = Date.now()
      try {
        for (const ws of wss.clients) {
          try {
            const client = SWITCHBOARD.getClient(ws)
            if (!client) {
              logger.warn(
                'Client not found in switchboard, terminating connection',
              )
              ws.terminate()
              continue
            }

            const lastSeen = client.lastSeen
            if (lastSeen < now - CONNECTION_TIMEOUT_MS) {
              ws.terminate()
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
  })
  wss.on('error', (err: Error) => {
    logger.error({ error: err }, 'Error on websocket server.')
  })
  wss.on('connection', (ws: WebSocket) => {
    // todo: should likely kill connections that haven't sent any ping for a long time
    // logger.info('WS client connected.')
    SWITCHBOARD.connect(ws)
    const clientSessionId =
      SWITCHBOARD.clients.get(ws)?.sessionId ?? 'mc-client-unknown'

    // Mark session as connected
    setSessionConnected(clientSessionId, true)
    ws.on('message', async (data: RawData) => {
      const result = await processMessage(ws, clientSessionId, data)
      // mqp: check ws.readyState before sending?
      ws.send(JSON.stringify(result))
    })
    ws.on('close', (code: number, reason: Buffer) => {
      // logger.debug(
      //   { code, reason: reason.toString() },
      //   'WS client disconnected.'
      // )

      // Mark session as disconnected to stop all agents
      setSessionConnected(clientSessionId, false)

      if (ASYNC_AGENTS_ENABLED) {
        // Cleanup async agents for this session
        asyncAgentManager.cleanupSession(clientSessionId)
      }

      SWITCHBOARD.disconnect(ws)
    })
    ws.on('error', (err: Error) => {
      logger.error({ error: err }, 'Error on websocket connection.')
    })
  })
  wss.on('close', function close() {
    if (deadConnectionCleaner) {
      clearInterval(deadConnectionCleaner)
    }
  })
  return wss
}

export const sendMessage = (ws: WebSocket, server: ServerMessage) => {
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
