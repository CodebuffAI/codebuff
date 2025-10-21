# CLI Testing

Comprehensive testing suite for the Codebuff CLI using tmux for interactive terminal emulation.

## Test Naming Convention

**IMPORTANT:** Follow these patterns for automatic tmux detection:

- **Unit tests:** `*.test.ts` (e.g., `cli-args.test.ts`)
- **E2E tests:** `e2e-*.test.ts` (e.g., `e2e-cli.test.ts`)
- **Integration tests:** `integration-*.test.ts` (e.g., `integration-tmux.test.ts`)

Files matching `*integration*.test.ts` or `*e2e*.test.ts` trigger automatic tmux availability checking in `.bin/bun`.

## Quick Start

```bash
cd cli
bun test
```

## Prerequisites

### For Integration Tests

Install tmux for interactive CLI testing:

```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt-get install tmux

# Windows (via WSL)
wsl --install
sudo apt-get install tmux
```

### For E2E Tests

Build the SDK first:

```bash
cd sdk
bun run build
cd ../cli
```

## Running Tests

### All Tests

```bash
bun test
```

### Specific Test Suites

```bash
# Unit tests
bun test cli-args.test.ts

# E2E tests (requires SDK)
bun test e2e-cli.test.ts

# Integration tests (requires tmux)
bun test integration-tmux.test.ts
```

### Manual tmux POC

```bash
bun run test:tmux-poc
```

## Automatic tmux Detection

The `.bin/bun` wrapper automatically checks for tmux when running integration/E2E tests:

- **Detects** test files matching `*integration*.test.ts` or `*e2e*.test.ts`
- **Checks** if tmux is installed
- **Shows** installation instructions if missing
- **Skips** tests gracefully if tmux unavailable

**Benefits:**
- ✅ Project-wide (works in any package)
- ✅ No hardcoded paths
- ✅ Clear test categorization
- ✅ Automatic dependency validation

## Test Structure

### Unit Tests

Test individual functions in isolation:

```typescript
import { describe, test, expect } from 'bun:test'

describe('CLI Arguments', () => {
  test('parses --agent flag', () => {
    // Test implementation
  })
})
```

### Integration Tests (tmux)

Test interactive CLI with full terminal emulation:

```typescript
import { describe, test, expect } from 'bun:test'
import { isTmuxAvailable } from './test-utils'

const tmuxAvailable = isTmuxAvailable()

describe.skipIf(!tmuxAvailable)('CLI Integration Tests', () => {
  test('handles user input', async () => {
    // Create tmux session
    // Send commands
    // Verify output
  })
})
```

### E2E Tests

Test complete CLI workflows:

```typescript
import { describe, test, expect } from 'bun:test'
import { isSDKBuilt } from './test-utils'

const sdkBuilt = isSDKBuilt()

describe.skipIf(!sdkBuilt)('CLI E2E Tests', () => {
  test('runs --help command', async () => {
    // Test CLI behavior
  })
})
```

## Test Utilities

Shared utilities in `test-utils.ts`:

```typescript
import { isTmuxAvailable, isSDKBuilt, sleep } from './test-utils'

// Check for tmux
if (isTmuxAvailable()) {
  // Run tmux tests
}

// Check for SDK
if (isSDKBuilt()) {
  // Run E2E tests
}

// Async delay
await sleep(1000)
```

## tmux Testing Approach

### Why tmux?

- ✅ Full terminal emulation with PTY support
- ✅ No native compilation needed (Bun 1.3+ compatible)
- ✅ Send keystrokes, capture output
- ✅ Can attach to sessions for debugging
- ✅ Cross-platform (macOS, Linux, WSL)

### Basic tmux Workflow

```typescript
// 1. Create tmux session
await tmux(['new-session', '-d', '-s', sessionName, 'your-command'])

// 2. Send commands
await tmux(['send-keys', '-t', sessionName, 'input text', 'Enter'])

// 3. Wait for output
await sleep(1000)

// 4. Capture output
const output = await tmux(['capture-pane', '-t', sessionName, '-p'])

// 5. Clean up
await tmux(['kill-session', '-t', sessionName])
```

### tmux Helper Function

```typescript
function tmux(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('tmux', args, { stdio: 'pipe' })
    let stdout = ''
    
    proc.stdout?.on('data', (data) => {
      stdout += data.toString()
    })
    
    proc.on('close', (code) => {
      code === 0 ? resolve(stdout) : reject(new Error('tmux failed'))
    })
  })
}
```

## Debugging Tests

### Attach to tmux Session

For debugging, keep session alive and attach:

```typescript
// Don't kill session immediately
await tmux(['new-session', '-d', '-s', 'debug-session', 'cli-command'])

// In another terminal
// tmux attach -t debug-session
```

### View Test Output

```bash
# Verbose test output
bun test --verbose

# Watch mode
bun test --watch
```

## Contributing

When adding new tests:

1. **Follow naming convention** (`*integration*.test.ts` or `*e2e*.test.ts`)
2. **Use test-utils.ts** for shared functionality
3. **Add graceful skipping** for missing dependencies
4. **Clean up resources** (tmux sessions, temp files)
5. **Document test purpose** clearly in test descriptions

## Troubleshooting

### tmux Not Found

```
⚠️  tmux not found but required for integration/E2E tests
```

**Solution:** Install tmux (see Prerequisites above)

### SDK Not Built

```
✓ Build SDK for E2E tests: cd sdk && bun run build [skip]
```

**Solution:** Build the SDK first (see Prerequisites above)

### Tests Hanging

- Check tmux session isn't waiting for input
- Ensure proper cleanup in `finally` blocks
- Use timeouts for tmux operations

### Session Already Exists

- Use unique session names (e.g., timestamp suffix)
- Clean up sessions in `beforeEach`/`afterEach`

## Performance

- **Unit tests:** ~100ms total
- **Integration tests:** ~2-5s per test (tmux overhead)
- **E2E tests:** ~3-10s per test (full CLI startup)

## CI/CD

For CI environments:

```yaml
# Install tmux in CI
- name: Install tmux
  run: |
    sudo apt-get update
    sudo apt-get install -y tmux

# Run tests
- name: Run tests
  run: bun test
```
