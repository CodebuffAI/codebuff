import { getAllFilePaths } from 'common/project-file-tree'
import { parentPort as maybeParentPort } from 'worker_threads'
import { initializeCheckpointFileManager } from '../checkpoints/file-manager'
import { getProjectFileContext, setProjectRoot } from '../project-files'

if (maybeParentPort) {
  const parentPort = maybeParentPort

  parentPort.on('message', async ({ dir }) => {
    setProjectRoot(dir)
    const initFileContext = await getProjectFileContext(dir, {})

    const relativeFilepaths = getAllFilePaths(initFileContext.fileTree)
    await initializeCheckpointFileManager({
      projectDir: dir,
      relativeFilepaths,
    })

    parentPort.postMessage(initFileContext)
  })
}
