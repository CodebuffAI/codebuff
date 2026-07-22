const { spawn, spawnSync } = require('child_process')
const { existsSync, readFileSync, rmSync } = require('fs')
const { tmpdir } = require('os')
const { join } = require('path')

const mode = process.argv[2]
const rendererFixture = process.argv[3]
const timeoutMs = 10_000

if (mode !== 'observe' && mode !== 'launch') {
  console.error(
    'usage: launcher-disconnect-fixture.cjs <observe|launch> [renderer-fixture]',
  )
  process.exit(2)
}

if (mode === 'launch') {
  // Stand in for the package's Node launcher. The observer terminates this
  // process externally after the renderer reports that it is ready.
  setInterval(() => {}, timeoutMs)
} else {
  if (!rendererFixture) {
    console.error('observe mode requires a renderer fixture')
    process.exit(2)
  }

  const cleanExitMarkerPath = join(
    tmpdir(),
    `launcher-disconnect-${process.pid}-${Math.random().toString(36).slice(2)}`,
  )
  const rendererReadyMarkerPath = `${cleanExitMarkerPath}-ready`
  const removeMarkers = () => {
    try {
      rmSync(cleanExitMarkerPath, { force: true })
      rmSync(rendererReadyMarkerPath, { force: true })
    } catch {}
  }
  const forceKill = (child) => {
    if (!child.pid || child.exitCode !== null) return
    try {
      if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(child.pid), '/F'], {
          stdio: 'ignore',
        })
      } else {
        child.kill('SIGKILL')
      }
    } catch {}
  }

  const launcher = spawn(process.execPath, [__filename, 'launch'], {
    stdio: 'inherit',
  })
  const cli = spawn(
    'bun',
    [
      rendererFixture,
      'launcher-disconnect',
      cleanExitMarkerPath,
      rendererReadyMarkerPath,
    ],
    {
      // The repository's package test command sets NODE_ENV=production while
      // this TSX fixture uses Bun's test JSX transform.
      env: {
        ...process.env,
        NODE_ENV: 'test',
        BUN_ENV: 'test',
        CODEBUFF_LAUNCHER_PID: String(launcher.pid),
      },
      stdio: 'inherit',
    },
  )

  let launcherKillRequested = false
  let launcherExited = false
  let cliExit

  const finishIfReady = () => {
    if (!launcherExited || !cliExit) return
    clearInterval(readyPoll)
    clearTimeout(timeout)

    let cleanExitConfirmed = false
    try {
      cleanExitConfirmed =
        readFileSync(cleanExitMarkerPath, 'utf8') === 'CLEAN_EXIT_VISIBLE'
    } catch {}
    removeMarkers()

    if (
      !launcherKillRequested ||
      cliExit.code !== 0 ||
      cliExit.signal !== null ||
      !cleanExitConfirmed
    ) {
      console.error('CLI exited without running clean-exit handlers')
      process.exit(8)
    }
    console.log('CLEAN_EXIT_VISIBLE\nCLI_EXITED_AFTER_LAUNCHER')
    process.exit(0)
  }

  launcher.once('error', (error) => {
    forceKill(cli)
    removeMarkers()
    console.error('failed to start launcher fixture:', error)
    process.exit(3)
  })
  launcher.once('exit', () => {
    launcherExited = true
    finishIfReady()
  })
  cli.once('error', (error) => {
    forceKill(launcher)
    removeMarkers()
    console.error('failed to start renderer fixture:', error)
    process.exit(4)
  })
  cli.once('exit', (code, signal) => {
    cliExit = { code, signal }
    finishIfReady()
  })

  const readyDeadline = Date.now() + timeoutMs
  const readyPoll = setInterval(() => {
    if (existsSync(rendererReadyMarkerPath) && !launcherKillRequested) {
      launcherKillRequested = true
      if (process.platform === 'win32') {
        const result = spawnSync(
          'taskkill',
          ['/PID', String(launcher.pid), '/F'],
          { stdio: 'inherit' },
        )
        if (result.error || result.status !== 0) {
          forceKill(cli)
          removeMarkers()
          console.error(
            'failed to kill launcher fixture:',
            result.error ?? `taskkill exited ${result.status}`,
          )
          process.exit(5)
        }
      } else {
        launcher.kill('SIGKILL')
      }
    } else if (Date.now() >= readyDeadline) {
      forceKill(launcher)
      forceKill(cli)
      removeMarkers()
      console.error('renderer fixture did not become ready')
      process.exit(6)
    }
  }, 25)

  const timeout = setTimeout(() => {
    clearInterval(readyPoll)
    forceKill(launcher)
    forceKill(cli)
    removeMarkers()
    console.error('CLI survived after its launcher exited')
    process.exit(7)
  }, timeoutMs + 1_000)
}
