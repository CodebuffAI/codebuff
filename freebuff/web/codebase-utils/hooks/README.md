# Integrity Manager

A lightweight system for ensuring Daytona workspaces are in the expected state during initialization.

## Overview

The `IntegrityManager` runs integrity checks to normalize workspace configuration. Instead of running all setup tasks on every initialization, it tracks state and only runs checks when needed.

## How It Works

### Check Frequencies

1. **`always`** - Runs on every initialization

   - Example: Starting the stats monitoring daemon

2. **`when`** - Runs only when a tracked value changes

   - Example: Re-checking S3 scripts when `DAYTONA_SNAPSHOT_ID` changes

3. **`once`** - Runs only the first time (not yet implemented)

### State Storage

State is stored in the workspace at `.vly-integrity-state.json`:

```json
{
  "ensureStatsScripts": {
    "lastValue": "vly-template-0-0-15-free",
    "lastRun": 1234567890,
    "execCount": 1
  }
}
```

## Usage

### In DaytonaCodebase

```typescript
// Define checks in registry
private checkRegistry: IntegrityCheckRegistry = {
  ensureSandboxConfiguration: {
    frequency: "always",
    execute: async () => await this.ensureSandboxConfiguration(),
  },
  ensureStatsScripts: {
    frequency: "when",
    trackValue: () => process.env.DAYTONA_SNAPSHOT_ID,
    execute: async () => await this.ensureStatsScripts(),
  },
};

// Initialize with file I/O in constructor
this.integrityManager = new IntegrityManager(
  this.checkRegistry,
  (path) => this.readFile(path),
  (path, content) => this.writeFile(path, content),
);

// Run all checks during initialization
await this.integrityManager.ensureAll();
```

### Adding New Checks

```typescript
ensureMyNewFeature: {
  frequency: "when",
  trackValue: () => process.env.MY_CONFIG_VERSION,
  execute: async () => await this.ensureMyNewFeature(),
}
```

## Benefits

- **Performance**: Only re-runs checks when conditions change
- **Simplicity**: Declarative check definitions
- **Flexibility**: Easy to add new checks or change frequencies
- **No DB overhead**: State stored in workspace filesystem
- **Non-blocking**: Failures are logged but don't break initialization

## Example Scenarios

### New Template Version

When `DAYTONA_SNAPSHOT_ID` changes from `vly-template-0-0-15-free` to `vly-template-0-0-16-free`:

- `ensureStatsScripts` detects the change and re-downloads scripts from S3
- State is updated with new snapshot ID
- Next initialization skips the check (unless snapshot ID changes again)

### Stats Monitoring

The `ensureStatsMonitoring` check:

- Runs every initialization (`frequency: "always"`)
- Checks if daemon is running
- Starts it if not running
- Fast check, minimal overhead
