import { parentPort as maybeParentPort } from 'worker_threads'
import { getProjectFileContext, setProjectRoot } from './project-files'
import { initializeCheckpointFileManager } from './checkpoint-file-manager'

if (maybeParentPort) {
  const parentPort = maybeParentPort

  parentPort.on('message', async ({ dir }) => {
    setProjectRoot(dir)
    const [initFileContext, _] = await Promise.all([
      getProjectFileContext(dir, {}),
      initializeCheckpointFileManager(),
    ])
    parentPort.postMessage(initFileContext)
  })
}
