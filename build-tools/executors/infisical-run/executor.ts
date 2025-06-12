import { ExecutorContext } from '@nx/devkit';
import { execSync } from 'child_process';

export interface InfisicalRunExecutorOptions {
  command: string;
  cwd?: string;
  logLevel?: string;
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
  const { command, cwd, logLevel = 'warn' } = options;

  const finalCommand = isInfisicalAvailable()
    ? `infisical run --log-level=${logLevel} -- ${command}`
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
