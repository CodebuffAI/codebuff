#!/usr/bin/env node
import { execSync } from 'child_process';

function isInfisicalAvailable(): boolean {
  try {
    execSync('command -v infisical', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const command = process.argv.slice(2).join(' ');
const finalCommand = isInfisicalAvailable()
  ? `infisical run --log-level=warn -- ${command}`
  : command;

execSync(finalCommand, { stdio: 'inherit' });
