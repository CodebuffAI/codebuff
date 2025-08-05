import { spawn } from 'child_process'

import type { PrintModeObject } from '@codebuff/common/types/print-mode'

const CODEBUFF_BINARY = 'codebuff'

export function processStream({
  codebuffArgs,
  authToken,
  handleEvent,
}: {
  codebuffArgs: string[]
  authToken?: string
  handleEvent: (event: PrintModeObject) => void
}): Promise<void> {
  let buffer = ''

  function onData(data: any) {
    buffer += data.toString()

    const lines = buffer.split('\n')

    buffer = lines.pop() || ''

    for (const line of lines) {
      const event = JSON.parse(line)
      handleEvent(event)
    }
  }

  const env = { ...process.env }
  if (authToken) {
    env.CODEBUFF_API_KEY = authToken
  }
  const child = spawn(CODEBUFF_BINARY, codebuffArgs, {
    stdio: 'pipe',
    env,
  })

  child.stdout.on('data', onData)
  child.stderr.on('data', onData)

  const { promise, resolve, reject } = Promise.withResolvers<void>()

  child.on('close', (code) => {
    if (code === 0) {
      resolve()
    } else {
      reject(new Error(`Codebuff exited with code ${code}`))
    }
  })

  return promise
}
