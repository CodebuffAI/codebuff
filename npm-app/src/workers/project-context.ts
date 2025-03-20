import { parentPort as maybeParentPort } from 'worker_threads'
import { getProjectFileContext, setProjectRoot } from '../project-files'
import { initializeCheckpointFileManager } from '../checkpoints/file-manager'
import { getAllFilePaths } from 'common/project-file-tree'

if (maybeParentPort) {
  const parentPort = maybeParentPort

  parentPort.on('message', async ({ dir }) => {
    setProjectRoot(dir)
    const initFileContext = await getProjectFileContext(dir, {})

    const relativeFilepaths = getAllFilePaths(initFileContext.fileTree)
    await initializeCheckpointFileManager({ projectDir: dir, relativeFilepaths })

    parentPort.postMessage(initFileContext)
  })
}
