import { ExecutorContext } from '@nx/devkit';
import { execSync } from 'child_process';

export interface InfisicalRunExecutorOptions {
  command: string;
  cwd?: string;
  logLevel?: string;
  env?: string;
}

function isInfisicalAvailable(): boolean {
  try {
    execSync('command -v infisical', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export default async function infisicalRunExecutor(
  options: InfisicalRunExecutorOptions,
  context: ExecutorContext
): Promise<{ success: boolean }> {
  const { command, cwd, logLevel = 'warn', env } = options;

  const envFlag = env ? `--env=${env}` : '';
  const finalCommand = isInfisicalAvailable()
    ? `infisical run ${envFlag} --log-level=${logLevel} -- ${command}`.replace(/\s+/g, ' ').trim()
    : command;

  try {
    execSync(finalCommand, {
      stdio: 'inherit',
      cwd: cwd || context.root
    });
    return { success: true };
  } catch (error) {
    return { success: false };
  }
}
