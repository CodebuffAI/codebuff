import { execSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'

import { cyan, green, red } from 'picocolors'

import {
  SWE_BENCH_PYTHON_PATH,
  SWE_BENCH_REPO_PATH,
  TEST_REPOS_DIR,
} from './test-setup'

const PREDICTIONS_DIR = path.join(TEST_REPOS_DIR, 'swebench_predictions')
const SWE_BENCH_RUN_SINGLE_INSTANCE_PATH = path.join(
  SWE_BENCH_REPO_PATH,
  'run_single_instance.py'
)

export async function passesSweBenchTests(
  instanceId: string,
  projectDir: string
): Promise<boolean> {
  var patch = execSync(`cd ${projectDir} && git diff`, { encoding: 'utf8' })

  console.log()
  for (const line of patch.split('\n')) {
    if (line.startsWith('+')) {
      console.log(green(line))
    } else if (line.startsWith('-')) {
      console.log(red(line))
    } else if (line.startsWith('@@')) {
      console.log(cyan(line))
    } else {
      console.log(line)
    }
  }

  fs.mkdirSync(PREDICTIONS_DIR, { recursive: true })
  const predictionsPath = path.join(PREDICTIONS_DIR, `${instanceId}.json`)

  fs.writeFileSync(
    predictionsPath,
    JSON.stringify(
      [
        {
          model_name_or_path: 'codebuff',
          instance_id: instanceId,
          model_patch: patch,
        },
      ],
      null,
      2
    )
  )

  console.log(`Running SWE-Bench tests on ${instanceId}...`)

  return new Promise((resolve) => {
    let output = ''
    const command = `${SWE_BENCH_PYTHON_PATH} ${SWE_BENCH_RUN_SINGLE_INSTANCE_PATH} --instance_id ${instanceId} --predictions_path ${predictionsPath}`

    const child = spawn('bash', ['-c', command], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    // Stream stdout while also capturing it
    child.stdout.on('data', (data) => {
      const chunk = data.toString()
      process.stdout.write(chunk)
      output += chunk
    })

    // Stream stderr while also capturing it
    child.stderr.on('data', (data) => {
      const chunk = data.toString()
      process.stderr.write(chunk)
      output += chunk
    })

    // Check for success when the process ends
    child.on('close', (code) => {
      if (code === 0 && output.includes('All Tests Passed')) {
        resolve(true)
      } else {
        resolve(false)
      }
    })
  })
}
