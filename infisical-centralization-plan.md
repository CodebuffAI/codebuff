# Centralized Infisical Command Execution Plan

## Problem
The codebase has sprawling `if command -v infisical >/dev/null 2>&1; then infisical run -- <command>; else <command>; fi` checks scattered across multiple files:

- `common/project.json` - db-migrate target
- `web/project.json` - build and discord:register targets
- `evals/package.json` - gen-git-evals, run-git-evals, run-eval-set scripts
- `backend/src/system-prompt/prompts.ts` - in system prompt text

## Solution: Custom Nx Executor
Create a custom Nx executor that handles infisical detection and wrapping internally, making project.json files clean and declarative.

## Implementation Steps

### 1. Create Custom Nx Executor
Create `tools/executors/infisical-run/executor.ts`:

```ts
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
```

### 2. Create Executor Schema
Create `tools/executors/infisical-run/schema.json`:

```json
{
  "$schema": "https://json-schema.org/schema",
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "Command to execute (with or without infisical)"
    },
    "cwd": {
      "type": "string",
      "description": "Working directory for the command"
    },
    "logLevel": {
      "type": "string",
      "description": "Infisical log level",
      "default": "warn"
    }
  },
  "required": ["command"]
}
```

### 3. Register the Executor
Create `tools/executors/infisical-run/executor.json`:

```json
{
  "description": "Run commands with automatic infisical wrapping",
  "implementation": "./executor",
  "schema": "./schema.json"
}
```

### 4. Update Project.json Files
Replace infisical checks in `common/project.json`:

```json
{
  "targets": {
    "db-migrate": {
      "executor": "@codebuff/tools:infisical-run",
      "options": {
        "command": "drizzle-kit push --config=./src/db/drizzle.config.ts"
      }
    }
  }
}
```

Replace infisical checks in `web/project.json`:

```json
{
  "targets": {
    "build": {
      "executor": "@codebuff/tools:infisical-run",
      "options": {
        "command": "next build"
      }
    },
    "discord:register": {
      "executor": "@codebuff/tools:infisical-run",
      "options": {
        "command": "bun run scripts/discord/register-commands.ts"
      }
    }
  }
}
```

### 5. Update Package.json Scripts (Alternative)
For package.json scripts that can't use Nx executors directly, create a CLI wrapper:

Create `tools/cli/infisical-run.ts`:
```ts
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
```

Update `evals/package.json`:
```json
{
  "scripts": {
    "gen-git-evals": "tsx ../tools/cli/infisical-run.ts bun run git-evals/gen-evals.ts",
    "run-git-evals": "tsx ../tools/cli/infisical-run.ts bun run git-evals/run-git-evals.ts",
    "run-eval-set": "tsx ../tools/cli/infisical-run.ts bun run git-evals/run-eval-set.ts"
  }
}
```

### 6. Update System Prompt
In `backend/src/system-prompt/prompts.ts`, remove or update the hardcoded infisical check reference since it's now handled by the build system.

### 7. Add Root Package.json Script
Add a convenience script to root `package.json`:

```json
{
  "scripts": {
    "exec": "./scripts/with-infisical.sh"
  }
}
```

## Benefits

1. **Nx-Native**: Leverages the existing build system properly
2. **Clean Configuration**: Project.json files become declarative and readable
3. **Single Source of Truth**: All infisical logic centralized in one executor
4. **Cacheable**: Nx can still cache results properly since it's a proper executor
5. **Type-Safe**: Proper TypeScript interfaces and JSON schema validation
6. **Consistent**: All projects use the same infisical handling logic
7. **Maintainable**: Changes to infisical behavior only need to be made in one place

## Environment Detection Logic

- **Local Development**: Infisical should be available and will be used automatically
- **Remote Environments**: Infisical may not be available, but environment variables should already be injected by the deployment system
- **CI/CD**: Environment variables are typically set directly in the CI system

This approach is the most "Nx-native" solution and provides the cleanest separation of concerns while maintaining all current functionality.
