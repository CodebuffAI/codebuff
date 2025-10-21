# CLI Testing Guide

## Unit Tests

Run unit tests for CLI argument parsing:

```bash
cd cli
bun test src/__tests__/cli-args.test.ts
```

These tests verify:
- `--agent` flag parsing with various agent IDs
- `--clear-logs` flag functionality
- Multi-flag combinations
- Help and version flags
- Edge cases (empty args, multi-word prompts)

## Non-Interactive Testing

### Manual Testing

Test the `--agent` flag manually:

```bash
# Test with a specific agent
cd cli
bun run src/index.tsx --agent ask "what is this project about?"

# Test with full agent ID
bun run src/index.tsx --agent codebuff/base-lite@1.0.0 "hello"

# Test without agent flag (uses default 'base')
bun run src/index.tsx "create a new component"

# Test help output
bun run src/index.tsx --help

# Test version output
bun run src/index.tsx --version
```

### Automated Testing

For CI/CD pipelines, run the unit tests:

```bash
cd cli
bun test
```

## Test Coverage

The tests ensure:

1. **Flag Parsing**: All flags are correctly parsed and passed through
2. **Agent Selection**: The `--agent` flag value is passed to the SDK's `client.run()` call
3. **Backward Compatibility**: Existing functionality without flags continues to work
4. **Error Handling**: Invalid flags are caught by Commander.js

## Continuous Testing

Add to your CI pipeline:

```yaml
- name: Test CLI flags
  run: |
    cd cli
    bun test
```

## Future Enhancements

To add more flags:

1. Add the option in `cli/src/index.tsx` using `.option()`
2. Pass it through to the App component
3. Thread it to the SDK call in `useSendMessage`
4. Add tests in `cli/src/__tests__/cli-args.test.ts`
