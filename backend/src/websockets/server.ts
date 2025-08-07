import { ASYNC_AGENTS_ENABLED } from '@codebuff/common/constants'
import { CLIENT_MESSAGE_SCHEMA } from '@codebuff/common/websockets/websocket-schema'
import { isError } from 'lodash'

import { asyncAgentManager } from '../async-agent-manager'
import { setSessionConnected } from '../live-user-inputs'
import { Switchboard } from './switchboard'
import { onWebsocketAction } from './websocket-action'
import { logger } from '../util/logger'

import type { ServerMessage } from '@codebuff/common/websockets/websocket-schema'
import type { WebSocket as BunWebSocket } from 'bun'

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
  ws: BunWebSocket,
  clientSessionId: string,
  data: string | Uint8Array,
): Promise<ServerMessage<'ack'>> {
  let messageObj: any
  try {
    const text =
      typeof data === 'string' ? data : new TextDecoder().decode(data)
    messageObj = JSON.parse(text)
  } catch (err) {
    logger.error(
      { err },
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
      txid: (messageObj && messageObj.txid) || undefined,
      success: false,
      error: serializeError(err),
    }
  }
}

export function startBunWebSocketServer({ pathname }: { pathname: string }) {
  // No-op here; Bun.serve is started in index.ts and hooks into these helpers
  logger.info(`Web socket route registered at ${pathname}.`)
}

export function handleWsOpen(ws: BunWebSocket) {
  SWITCHBOARD.connect(ws)
  const clientSessionId =
    SWITCHBOARD.clients.get(ws)?.sessionId ?? 'mc-client-unknown'
  setSessionConnected(clientSessionId, true)
}

export async function handleWsMessage(
  ws: BunWebSocket,
  message: string | Uint8Array,
) {
  const clientSessionId =
    SWITCHBOARD.clients.get(ws)?.sessionId ?? 'mc-client-unknown'
  const result = await processMessage(ws, clientSessionId, message)
  try {
    ws.send(JSON.stringify(result))
  } catch {}
}

export function handleWsClose(ws: BunWebSocket) {
  const clientSessionId =
    SWITCHBOARD.clients.get(ws)?.sessionId ?? 'mc-client-unknown'
  setSessionConnected(clientSessionId, false)
  if (ASYNC_AGENTS_ENABLED) {
    asyncAgentManager.cleanupSession(clientSessionId)
  }
  SWITCHBOARD.disconnect(ws)
}

export function startDeadConnectionCleaner(_wss?: {
  clients: Set<BunWebSocket>
}) {
  const interval = setInterval(() => {
    const now = Date.now()
    try {
      for (const ws of SWITCHBOARD.clients.keys()) {
        try {
          const client = SWITCHBOARD.getClient(ws)
          if (client.lastSeen < now - CONNECTION_TIMEOUT_MS) {
            SWITCHBOARD.disconnect(ws)
            try {
              ws.close()
            } catch {}
          }
        } catch {}
      }
    } catch (error) {
      logger.error({ error }, 'Error in deadConnectionCleaner outer loop')
    }
  }, CONNECTION_TIMEOUT_MS)
  return () => clearInterval(interval)
}

export const sendMessage = (ws: BunWebSocket, server: ServerMessage) => {
  ws.send(JSON.stringify(server))
}

export function sendRequestReconnect() {
  for (const ws of SWITCHBOARD.clients.keys()) {
    sendMessage(ws, {
      type: 'action',
      data: { type: 'request-reconnect' },
    })
  }
}

export function waitForAllClientsDisconnected() {
  return SWITCHBOARD.waitForAllClientsDisconnected()
}
