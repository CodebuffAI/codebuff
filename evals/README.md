# Remote Evaluation Infrastructure

This directory contains the infrastructure for running Codebuff evaluations in containerized environments (Docker Compose) for CI/CD and local testing.

## Quick Start

### Option 1: Using Drizzle Seed (Recommended)
```bash
bash evals/scripts/run-remote.sh seed
```

### Option 2: Using Test Auth Bypass (Faster)
```bash
bash evals/scripts/run-remote.sh bypass
```

## Prerequisites

- Docker and Docker Compose
- Bun runtime
- Optional: `npm install -g codebuff` (or set `CODEBUFF_SKIP_BINARY_CHECK=1`)

## Architecture

- **evals/docker-compose.evals.yml**: Orchestrates PostgreSQL database and backend services
- **evals/backend.Dockerfile**: Backend container definition
- **evals/seeds/seed-evals.ts**: Drizzle-based database seeding for test users/sessions
- **evals/scripts/run-remote.sh**: Main runner script with teardown
- **evals/scripts/wait-for-healthz.sh**: Health check waiting utility

## Key Features

### SDK Enhancements
- **Binary Check Skip**: Set `CODEBUFF_SKIP_BINARY_CHECK=1` to skip codebuff CLI requirement
- **WebSocket URL Override**: Set `CODEBUFF_WEBSOCKET_URL=ws://127.0.0.1:4242/ws` to target ephemeral backend

### Backend Enhancements
- **Test Auth Bypass**: Set `CODEBUFF_TEST_AUTH_TOKEN` + `NODE_ENV=test` for quick auth
- **WebSocket-Ready Health Check**: `/healthz` returns 503 until WebSocket server is accepting connections

### Container Strategy
- **Loopback Binding**: Backend bound to `127.0.0.1:4242` only (no public exposure)
- **Optimized PostgreSQL**: Fast settings for CI (fsync=off, etc.)
- **Build Context**: Uses repo root with Dockerfile in evals/ for clean separation

## Environment Variables

- `CODEBUFF_WEBSOCKET_URL`: Override WebSocket URL (e.g., `ws://127.0.0.1:4242/ws`)
- `CODEBUFF_SKIP_BINARY_CHECK=1`: Skip SDK binary presence check
- `CODEBUFF_TEST_AUTH_TOKEN`: Enable test-only auth bypass (when NODE_ENV=test)
- `CODEBUFF_API_KEY`: API key for SDK authentication (set by scripts)

## GitHub Actions Integration

### Automatic Trigger
Add `[remote-eval]` to your commit message to trigger remote evaluations:
```bash
git commit -m "fix: terminal CWD handling [remote-eval]"
```

### Manual Trigger
Go to Actions → Remote Evaluations → Run workflow:
- **Eval file**: `eval-codebuff.json` (default)
- **Commit index**: `0` (default) 
- **Mode**: `bypass` or `seed`

### Matrix Evaluations
Add `[remote-eval-all]` to run multiple evaluations in parallel:
```bash
git commit -m "major: refactor terminal logic [remote-eval-all]"
```

### Workflow Files
- `.github/workflows/remote-evals.yml` - Main remote evaluation workflow
- Uses our containerized infrastructure with Docker Compose
- Uploads artifacts and logs automatically
- Handles cleanup and error reporting

### Usage in CI

```yaml
# Single evaluation
- name: Run remote eval (bypass mode)
  run: bash evals/scripts/run-remote-parameterized.sh bypass eval-codebuff.json 0

# With database seeding  
- name: Run remote eval (seed mode)
  run: bash evals/scripts/run-remote-parameterized.sh seed eval-manifold.json 1
```

## Manual Usage

1. Start services:
   ```bash
   docker compose -f evals/docker-compose.evals.yml up -d --build db backend
   ```

2. Wait for readiness:
   ```bash
   evals/scripts/wait-for-healthz.sh http://127.0.0.1:4242/healthz 90
   ```

3. Seed database and capture API key:
   ```bash
   KEY_LINE=$(docker compose -f evals/docker-compose.evals.yml run --rm seeder | tail -n1)
   export CODEBUFF_API_KEY="${KEY_LINE#CODEBUFF_API_KEY=}"
   ```

4. Run evaluation:
   ```bash
   export CODEBUFF_WEBSOCKET_URL=ws://127.0.0.1:4242/ws
   export CODEBUFF_SKIP_BINARY_CHECK=1
   bun scripts/git-evals/run-single-eval.ts --prompt "Your test prompt"
   ```

5. Cleanup:
   ```bash
   docker compose -f evals/docker-compose.evals.yml down -v
   ```

## Troubleshooting

- **Connection Issues**: Check that `CODEBUFF_WEBSOCKET_URL=ws://127.0.0.1:4242/ws` is set
- **Auth Failures**: Verify `CODEBUFF_API_KEY` is properly captured from seeder output
- **Backend Not Ready**: Ensure `/healthz` returns 200 before proceeding
- **Port Conflicts**: Backend binds to `127.0.0.1:4242` - ensure port is available

## Implementation Details

Based on the remote-eval-infra-plan.md specification:
- Monorepo + Bun compatible
- Docker-agnostic backend (Dockerfile lives in evals/)
- Idempotent Drizzle seeding with deterministic IDs
- WS readiness validation in health checks
- Test-only auth bypass for fast smoke tests
- Comprehensive error logging and cleanup