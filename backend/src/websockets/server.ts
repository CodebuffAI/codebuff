import { Server as HttpServer } from 'node:http'
import { Server as WebSocketServer, RawData, WebSocket } from 'ws'
import { isError, set } from 'lodash'
import {
  ClientMessage,
  ServerMessage,
  CLIENT_MESSAGE_SCHEMA,
} from 'common/websockets/websocket-schema'
import { Switchboard } from './switchboard'
import { onWebsocketAction } from './websocket-action'
import { logger } from '../util/logger'

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

function parseMessage(data: RawData): ClientMessage {
  let messageObj: any
  try {
    messageObj = JSON.parse(data.toString())
  } catch (err) {
    logger.error(
      { err, data },
      'Error parsing message: not valid UTF-8 encoded JSON.'
    )
    throw new MessageParseError('Message was not valid UTF-8 encoded JSON.')
  }
  const result = CLIENT_MESSAGE_SCHEMA.safeParse(messageObj)
  if (!result.success) {
    const issues = result.error.issues.map((i) => {
      return {
        field: i.path.join('.') || null,
        error: i.message,
      }
    })
    logger.error(
      { issues, errors: result.error.errors },
      'Error parsing message'
    )
    throw new MessageParseError('Error parsing message.', issues)
  } else {
    return result.data
  }
}

async function processMessage(
  ws: WebSocket,
  clientSessionId: string,
  data: RawData
): Promise<ServerMessage<'ack'>> {
  try {
    const msg = parseMessage(data)
    const { type, txid } = msg
    try {
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
    } catch (err) {
      logger.error({ err }, 'Error processing message')
      return { type: 'ack', txid, success: false, error: serializeError(err) }
    }
    return { type: 'ack', txid, success: true }
  } catch (err) {
    logger.error({ err }, 'Error processing message')
    return { type: 'ack', success: false, error: serializeError(err) }
  }
}

export function listen(server: HttpServer, path: string) {
  logger.info(`Listening on websocket path: ${path}`)
  const wss = new WebSocketServer({ server, path })
  let deadConnectionCleaner: any | undefined
  wss.on('listening', () => {
    logger.info(`Web socket server listening on ${path}.`)
    deadConnectionCleaner = setInterval(function ping() {
      const now = Date.now()
      try {
        for (const ws of wss.clients) {
          try {
            const client = SWITCHBOARD.getClient(ws)
            if (!client) {
              logger.warn('Client not found in switchboard, terminating connection')
              ws.terminate()
              continue
            }
            
            const lastSeen = client.lastSeen
            if (lastSeen < now - CONNECTION_TIMEOUT_MS) {
              logger.info(
                { lastSeen, now, diff: now - lastSeen },
                'Terminating inactive connection'
              )
              ws.terminate()
            }
          } catch (err) {
            logger.error(
              { error: err },
              'Error checking individual connection in deadConnectionCleaner'
            )
          }
        }
      } catch (error) {
        logger.error(
          { error },
          'Error in deadConnectionCleaner outer loop'
        )
      }
    }, CONNECTION_TIMEOUT_MS)
  })
  wss.on('error', (err) => {
    logger.error({ error: err }, 'Error on websocket server.')
  })
  wss.on('connection', (ws) => {
    // todo: should likely kill connections that haven't sent any ping for a long time
    // logger.info('WS client connected.')
    SWITCHBOARD.connect(ws)
    const clientSessionId =
      SWITCHBOARD.clients.get(ws)?.sessionId ?? 'mc-client-unknown'
    ws.on('message', async (data) => {
      const result = await processMessage(ws, clientSessionId, data)
      // mqp: check ws.readyState before sending?
      ws.send(JSON.stringify(result))
    })
    ws.on('close', (code, reason) => {
      // logger.debug(
      //   { code, reason: reason.toString() },
      //   'WS client disconnected.'
      // )
      SWITCHBOARD.disconnect(ws)
    })
    ws.on('error', (err) => {
      logger.error({ error: err }, 'Error on websocket connection.')
    })
  })
  wss.on('close', function close() {
    clearInterval(deadConnectionCleaner)
  })
  return wss
}

export const sendMessage = (ws: WebSocket, server: ServerMessage) => {
  ws.send(JSON.stringify(server))
}
