import { SessionState } from '@codebuff/common/types/session-state'
import { WebSocket } from 'ws'

export async function research(
  ws: WebSocket,
  prompts: string[],
  initialSessionState: SessionState,
  options: {
    userId: string | undefined
    clientSessionId: string
    fingerprintId: string
    promptId: string
  }
): Promise<string[]> {
  return []
}
