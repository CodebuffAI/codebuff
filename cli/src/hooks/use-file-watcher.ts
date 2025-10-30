import { useEffect, useRef, useState } from 'react'
import * as fs from 'fs'
import * as path from 'path'

import { logger } from '../utils/logger'

/**
 * Hook that watches a directory for file changes.
 * Returns a change counter that increments each time files change.
 */
export const useFileWatcher = (
  directoryPath: string | null,
  options: {
    extensions?: string[]
    debounceMs?: number
  } = {},
): number => {
  const { extensions = ['.ts', '.js', '.json', '.tsx', '.jsx'], debounceMs = 300 } = options
  const [changeCount, setChangeCount] = useState(0)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const watcherRef = useRef<fs.FSWatcher | null>(null)

  useEffect(() => {
    if (!directoryPath) {
      logger.debug('No directory path provided, file watcher not started')
      return
    }

    // Check if directory exists
    if (!fs.existsSync(directoryPath)) {
      logger.warn({ directoryPath }, 'Directory does not exist')
      return
    }

    logger.debug({ directoryPath }, 'Setting up file watcher')

    try {
      // Watch the directory for changes
      watcherRef.current = fs.watch(
        directoryPath,
        { recursive: true },
        (eventType, filename) => {
          if (!filename) return

          // Only track changes for specified file extensions
          const ext = path.extname(filename)
          if (!extensions.includes(ext)) {
            return
          }

          logger.debug(
            { eventType, filename },
            'File changed, scheduling change notification',
          )

          // Debounce changes
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
          }

          debounceTimerRef.current = setTimeout(() => {
            debounceTimerRef.current = null
            setChangeCount((prev) => prev + 1)
            logger.debug({ filename }, 'File change registered')
          }, debounceMs)
        },
      )

      logger.debug('File watcher started successfully')
    } catch (error) {
      logger.error({ error, directoryPath }, 'Failed to start file watcher')
    }

    // Cleanup on unmount
    return () => {
      if (watcherRef.current) {
        logger.debug('Cleaning up file watcher')
        watcherRef.current.close()
        watcherRef.current = null
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [directoryPath, debounceMs, extensions.join(',')])

  return changeCount
}
