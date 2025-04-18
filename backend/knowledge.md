# Backend Knowledge

## Testing

### Module Mocking
- Use exact import paths when mocking modules (e.g., 'common/db' not '@/common/db')
- Mock all required dependencies, including env files
- Use fixed UTC dates in tests to avoid timezone issues
- Add debug logging to help track test execution and failures

Run type checks after changes:
```bash
bun run --cwd backend typecheck
```
