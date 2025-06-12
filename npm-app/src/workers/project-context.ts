import { parentPort as maybeParentPort } from 'worker_threads'
import path from 'path'

// Use dynamic import to resolve the correct path at runtime
const getProjectFileTreeModule = async () => {
  // In the built worker, we need to import from the copied common directory
  const isBuilt = __filename.endsWith('.js')
  if (isBuilt) {
    return await import(path.join(__dirname, '../common/project-file-tree.js'))
  } else {
    return await import('@codebuff/common/project-file-tree')
  }
}

import { initializeCheckpointFileManager } from '../checkpoints/file-manager'
import { getProjectFileContext, setProjectRoot } from '../project-files'

if (maybeParentPort) {
  const parentPort = maybeParentPort

  parentPort.on('message', async ({ dir }) => {
    setProjectRoot(dir)
    const initFileContext = await getProjectFileContext(dir, {})
    if (!initFileContext) {
      throw new Error('Failed to initialize project file context')
    }

    const { getAllFilePaths } = await getProjectFileTreeModule()
    const relativeFilepaths = getAllFilePaths(initFileContext.fileTree)
    await initializeCheckpointFileManager({
      projectDir: dir,
      relativeFilepaths,
    })

    parentPort.postMessage(initFileContext)
  })
}
