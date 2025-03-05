import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import {
  TEST_REPOS_DIR,
  SWE_BENCH_REPO_PATH,
  SWE_BENCH_PYTHON_PATH,
} from './test-setup'

const PREDICTIONS_DIR = path.join(TEST_REPOS_DIR, 'swebench_predictions')
const SWE_BENCH_RUN_SINGLE_INSTANCE_PATH = path.join(
  SWE_BENCH_REPO_PATH,
  'run_single_instance.py'
)

export function passesSweBenchTests(
  instanceId: string,
  projectDir: string
): boolean {
  var patch = execSync(`cd ${projectDir} && git diff`, { encoding: 'utf8' })

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

  try {
    execSync(
      `${SWE_BENCH_PYTHON_PATH} ${SWE_BENCH_RUN_SINGLE_INSTANCE_PATH} --instance_id \"${instanceId}\" --predictions_path \"${predictionsPath}\" 2>&1 | grep \"All Tests Passed\"`
    )
    return true
  } catch (error) {
    // Grep output no lines
    return false
  }
}
