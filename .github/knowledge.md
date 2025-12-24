# GitHub Workflows

## Refactoring Patterns

### Composite Actions

Common setup steps (checkout, Bun setup, caching, installation) have been extracted to `.github/actions/setup-project/action.yml`.

Usage:

```yaml
steps:
  - uses: actions/checkout@v4
    with:
      # checkout-specific params

  - uses: ./.github/actions/setup-project
```

Note: Checkout must be separate from the composite action to avoid circular dependencies.

### Environment Variables

GitHub API URLs are extracted as environment variables to avoid duplication:

```yaml
env:
  GITHUB_API_URL: https://api.github.com/repos/CodebuffAI/codebuff
  GITHUB_UPLOADS_URL: https://uploads.github.com/repos/CodebuffAI/codebuff
```

This pattern:

- Reduces duplication across workflow steps
- Makes repository changes easier (single point of change)
- Improves readability and maintainability

## CI/CD Pipeline Overview

The CI pipeline consists of two main jobs:

1. **Build Job**: Installs dependencies, builds web, runs typecheck, and builds npm-app
2. **Test Job**: Runs tests for npm-app, backend, and common packages in parallel using matrix strategy

### Key Configuration

- Uses Bun version from `.bun-version` file for all jobs
- Tests use retry logic (max 5 attempts, 10 min timeout)
- Dependencies are cached between jobs using `actions/cache@v4`
- Environment variables are set from GitHub secrets using `scripts/generate-ci-env.ts`

### Test Strategy

Tests run in parallel using matrix strategy:

```yaml
strategy:
  matrix:
    package: [npm-app, backend, common]
```

Each test job:

- Runs unit tests only (excludes integration tests)
- Uses `nick-fields/retry@v3` for reliability
- Sets `CODEBUFF_GITHUB_ACTIONS=true` and `NEXT_PUBLIC_CB_ENVIRONMENT=test`

### Environment Variables

- Secrets are extracted using `scripts/generate-ci-env.ts`
- Environment variables are set dynamically from GitHub secrets
- Test environment flags are set for proper test execution

## Workflow Structure

- Triggered on push/PR to main branch
- Build job must complete before test jobs start (`needs: build`)
- Uses `actions/checkout@v4`, `oven-sh/setup-bun@v2`, and `actions/cache@v4`
- Commented debug shell available for troubleshooting failures

## Artifact Actions

- Use `actions/upload-artifact@v4` and `actions/download-artifact@v4`
- v3 was deprecated and stopped working on January 30th, 2025
- v4 provides up to 98% faster upload/download speeds
- See [GitHub's migration guide](https://github.com/actions/upload-artifact/blob/main/docs/MIGRATION.md) for breaking changes

## Environment Variables in CI

### GitHub Actions Environment

- Secrets and environment variables are managed through GitHub repository settings
- The workflow uses GitHub secrets for sensitive data
- CI-specific flags (like CODEBUFF_GITHUB_ACTIONS) are set directly in workflow steps

### Local Testing with Act

When running GitHub Actions locally using `act`:

1. **Environment Setup**:

   - `.github/act/bootstrap-act-config.sh` generates:
     - `.actrc`: Docker and artifact settings
     - `.env.act`: Non-secret environment variables
     - `.secrets.act`: Secret environment variables (chmod 600)

2. **File Handling**:

   - `run-local.sh` automatically:
     - Backs up existing `.env.local` before running
     - Restores the backup after completion
   - The CI workflow only writes `CODEBUFF_GITHUB_ACTIONS=true` to `.env.local`
   - Other environment variables come from `.env.act` and `.secrets.act`

3. **Running Act**:

   ```bash
   # Run all jobs
   bun act

   # Run specific job
   bun act -j test-backend

   # List available jobs
   bun act -l

   # Dry run to see what would happen
   bun act -n

   # Verbose output for debugging
   bun act -v
   ```

### Prerequisites

1. Install `act`:
   ```bash
   brew install act  # macOS
   ```
2. Docker must be running
3. Make sure `.github/act/bootstrap-act-config.sh` is executable:
   ```bash
   chmod +x .github/act/bootstrap-act-config.sh
   ```

### Configuration Files

- `.actrc`: Default act flags and settings
- `.env.act`: Non-secret environment variables
- `.secrets.act`: Secret environment variables (chmod 600)
- `.github/actions/setup-job/action.yml`: Reusable setup steps
- `.github/act/run-local.sh`: Helper script for running act

### Important Notes

- First run will be slower as it builds the Docker image
- Subsequent runs are faster due to `--reuse` flag
- The `--bind` flag mounts local directories for file persistence
- Docker should have at least 8GB memory allocated
- `.secrets` file is auto-created from `.env.local` if it doesn't exist

### Troubleshooting

1. If Docker container fails to start:

   - Check Docker memory allocation
   - Ensure Docker daemon is running
   - Use `bun act -v` for verbose output

2. If tests fail with environment issues:

   - Verify `.secrets` file was created correctly
   - Check that `CODEBUFF_GITHUB_ACTIONS=true` is set
   - Ensure all required environment variables are present

3. If Bun commands fail:
   - Check that Bun version in Dockerfile matches `.bun-version` file
   - Verify Docker image built successfully
   - Try rebuilding the image without cache

### Best Practices

1. Run specific jobs instead of all jobs when possible
2. Use dry run (`-n`) to verify configuration
3. Keep Docker image up to date with CI environment
4. Regularly clean up unused Docker images/containers
5. Version control `.github/actions/` and `.github/act/`
6. Use the retry mechanism for flaky tests
7. Cache dependencies between jobs for faster builds
