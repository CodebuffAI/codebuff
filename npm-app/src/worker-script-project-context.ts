import { parentPort as maybeParentPort } from 'worker_threads'
import { getProjectFileContext, setProjectRoot } from './project-files'

if (maybeParentPort) {
  const parentPort = maybeParentPort

  parentPort.on('message', async ({ dir }) => {
    setProjectRoot(dir)
    const initFileContext = await getProjectFileContext(dir, {})
    parentPort.postMessage(initFileContext)
  })
}
