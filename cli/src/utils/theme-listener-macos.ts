import { existsSync, watch, type FSWatcher } from 'fs'

import { getIDEThemeConfigPaths } from './theme-system'

/**
 * macOS theme change listener using polling
 * Checks the system theme preference every 0.5 seconds
 */

// Shell script that polls for theme changes
const WATCH_SCRIPT = `
# Initial value
LAST_VALUE=""

while true; do
  # Check if AppleInterfaceStyle key exists (Dark mode)
  CURRENT_VALUE=$(defaults read -g AppleInterfaceStyle 2>/dev/null || echo "Light")

  # If changed, output notification
  if [ "$LAST_VALUE" != "" ] && [ "$CURRENT_VALUE" != "$LAST_VALUE" ]; then
    echo "THEME_CHANGED"
  fi

  LAST_VALUE="$CURRENT_VALUE"

  # Wait a bit before checking again (very lightweight)
  sleep 0.5
done
`

const IDE_THEME_DEBOUNCE_MS = 200

interface IDEWatcherHandle {
  watchers: FSWatcher[]
  dispose: () => void
}

const createIDEThemeWatchers = (
  onThemeChange: () => void,
): IDEWatcherHandle => {
  const watchers: FSWatcher[] = []
  const targets = new Set(getIDEThemeConfigPaths())

  if (targets.size === 0) {
    return {
      watchers,
      dispose: () => {},
    }
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const scheduleNotify = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }

    debounceTimer = setTimeout(() => {
      debounceTimer = null
      onThemeChange()
    }, IDE_THEME_DEBOUNCE_MS)
  }

  for (const path of targets) {
    try {
      if (!existsSync(path)) {
        continue
      }

      const watcher = watch(path, { persistent: false }, () => {
        scheduleNotify()
      })

      watchers.push(watcher)
    } catch {
      // Ignore watcher failures (e.g., permissions)
    }
  }

  return {
    watchers,
    dispose: () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
    },
  }
}

export interface ThemeListenerProcess {
  kill: () => void
}

/**
 * Spawns a shell script that watches for macOS theme changes
 * @param onThemeChange - Callback invoked when theme changes
 * @returns Process handle to clean up later
 */
export const spawnMacOSThemeListener = (
  onThemeChange: () => void,
): ThemeListenerProcess | null => {
  if (typeof Bun === 'undefined') {
    return null
  }

  if (process.platform !== 'darwin') {
    return null
  }

  const bash = Bun.which('bash')
  if (!bash) {
    return null
  }

  try {
    const proc = Bun.spawn({
      cmd: [bash, '-c', WATCH_SCRIPT],
      stdout: 'pipe',
      stderr: 'pipe',
    })

    const watcherHandle = createIDEThemeWatchers(onThemeChange)

    // Read stderr to prevent blocking
    const readStderr = async () => {
      const reader = proc.stderr.getReader()
      try {
        while (true) {
          const { done } = await reader.read()
          if (done) break
        }
      } catch {
        // Process was killed or errored, ignore
      }
    }

    readStderr()

    // Read stdout line by line
    const readStdout = async () => {
      const reader = proc.stdout.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.trim() === 'THEME_CHANGED') {
              onThemeChange()
            }
          }
        }
      } catch {
        // Process was killed or errored, ignore
      }
    }

    readStdout()

    return {
      kill: () => {
        try {
          proc.kill()
        } catch {
          // Ignore errors when killing
        }

        for (const watcher of watcherHandle.watchers) {
          try {
            watcher.close()
          } catch {
            // Ignore watcher closure errors
          }
        }

        watcherHandle.dispose()
      },
    }
  } catch {
    return null
  }
}
