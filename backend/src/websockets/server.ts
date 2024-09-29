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
import { checkQuota, limitFingerprint, resetQuota } from '../billing/message'
import { debugLog } from '../util/debug'
import { match, P } from 'ts-pattern'

const SWITCHBOARD = new Switchboard()

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
    console.error(err)
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
    console.error(issues, result.error.errors)
    throw new MessageParseError('Error parsing message.', issues)
  } else {
    return result.data
  }
}

async function processMessage(
  ws: WebSocket,
  data: RawData
): Promise<ServerMessage<'ack'>> {
  try {
    const msg = parseMessage(data)
    const { type, txid } = msg
    try {
      switch (type) {
        case 'identify': {
          SWITCHBOARD.identify(ws, msg.uid)
          break
        }
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
          const fingerprintId = match(msg.data)
            .with(
              {
                fingerprintId: P.string,
              },
              ({ fingerprintId }) => fingerprintId
            )
            .otherwise(() => null)

          if (!fingerprintId) {
            console.error(
              'No fingerprintId found, cannot check quota',
              msg.type
            )
          } else {
            const { creditsUsed, quota, userId, endDate } =
              await checkQuota(fingerprintId)
            if (creditsUsed >= quota) {
              debugLog(
                `Usage limit exceeded for user ${fingerprintId}: ${creditsUsed} >= ${quota}`
              )
              limitFingerprint(fingerprintId, userId)
              return {
                type: 'ack',
                txid,
                success: true,
                error: `Usage limit exceeded. Please ${userId ? 'upgrade your plan to' : "type 'login' to sign up and"} keep using Manicode.`,
              }
            } else {
              if (endDate < new Date()) {
                // End date is in the past, so we should reset the quota
                resetQuota(fingerprintId, userId)
              }
            }
          }

          onWebsocketAction(ws, msg)
          break
        }
        default:
          throw new Error("Unknown message type; shouldn't be possible here.")
      }
    } catch (err) {
      console.error(err)
      return { type: 'ack', txid, success: false, error: serializeError(err) }
    }
    return { type: 'ack', txid, success: true }
  } catch (err) {
    console.error(err)
    return { type: 'ack', success: false, error: serializeError(err) }
  }
}

export function listen(server: HttpServer, path: string) {
  console.log('listen on websocket')
  const wss = new WebSocketServer({ server, path })
  let deadConnectionCleaner: NodeJS.Timeout | undefined
  wss.on('listening', () => {
    console.log(`Web socket server listening on ${path}.`)
    deadConnectionCleaner = setInterval(function ping() {
      const now = Date.now()
      try {
        for (const ws of wss.clients) {
          const client = SWITCHBOARD.getClient(ws)
          const lastSeen = client.lastSeen
          if (lastSeen < now - CONNECTION_TIMEOUT_MS) {
            ws.terminate()
          }
        }
      } catch (error) {
        // console.error('Error in deadConnectionCleaner', error)
      }
    }, CONNECTION_TIMEOUT_MS)
  })
  wss.on('error', (err) => {
    console.error('Error on websocket server.', { error: err })
  })
  wss.on('connection', (ws) => {
    // todo: should likely kill connections that haven't sent any ping for a long time
    // console.log('WS client connected.')
    SWITCHBOARD.connect(ws)
    ws.on('message', async (data) => {
      const result = await processMessage(ws, data)
      // mqp: check ws.readyState before sending?
      ws.send(JSON.stringify(result))
    })
    ws.on('close', (code, reason) => {
      // console.log(`WS client disconnected.`, {
      //   code,
      //   reason: reason.toString(),
      // })
      SWITCHBOARD.disconnect(ws)
    })
    ws.on('error', (err) => {
      console.error('Error on websocket connection.', { error: err })
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
