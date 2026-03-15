import fs from 'fs'
import os from 'os'
import path from 'path'
import { platform } from 'process'

import { getProcessEnv } from '../env-process'

import type { ProcessEnv } from '../types/contracts/env'

const CHROME_PATHS: Record<string, string[]> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
    '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome-beta',
    '/usr/bin/google-chrome-unstable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
  ],
}

export const findChromeExecutable = (): string | null => {
  const paths = CHROME_PATHS[platform] ?? []
  for (const p of paths) {
    if (p && fs.existsSync(p)) return p
  }
  return null
}

export const getSystemInfo = (processEnv: ProcessEnv = getProcessEnv()) => {

  return {
    platform,
    shell: 'bash',
    nodeVersion: process.version,
    arch: process.arch,
    homedir: os.homedir(),
    cpus: os.cpus().length,
    chromeAvailable: findChromeExecutable() !== null,
  }
}
