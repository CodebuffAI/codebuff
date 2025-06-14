import { getAllFilePaths } from '@codebuff/common/project-file-tree'
import { parentPort as maybeParentPort } from 'worker_threads'
import { initializeCheckpointFileManager } from './checkpoints/file-manager'
import { getProjectFileContext, setProjectRoot } from './project-files'

const DEBUG = true

if (maybeParentPort) {
  const parentPort = maybeParentPort

  // Override console.log to send messages to main thread when DEBUG is enabled
  if (DEBUG) {
    const rawLog = console.log
    console.log = (...args: unknown[]) => {
      parentPort.postMessage({
        kind: 'log',
        payload: JSON.parse(JSON.stringify(args)),
      })
      rawLog.apply(console, args) // keep local visibility if you want
    }
  }

  parentPort.on('message', async ({ dir }) => {
    if (DEBUG) {
      console.log('Project context worker started for directory:', dir)
    }

    setProjectRoot(dir)
    const initFileContext = await getProjectFileContext(dir, {})
    if (!initFileContext) {
      throw new Error('Failed to initialize project file context')
    }

    const relativeFilepaths = getAllFilePaths(initFileContext.fileTree)
    await initializeCheckpointFileManager({
      projectDir: dir,
      relativeFilepaths,
    })

    parentPort.postMessage(initFileContext)
  })
}
