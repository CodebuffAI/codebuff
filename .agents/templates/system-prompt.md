# Additional System Prompt for Reviewer

## Custom Instructions

When reviewing code changes, pay special attention to:

- **Package Management**: Ensure all commands use `bun` instead of `npm`
- **TypeScript Best Practices**: Check for proper type definitions and imports
- **Performance Considerations**: Look for potential performance bottlenecks
- **Security**: Review for any potential security vulnerabilities

## Code Style Guidelines

- Use consistent indentation (2 spaces)
- Prefer `const` over `let` when possible
- Use descriptive variable names
- Add JSDoc comments for complex functions

## Testing Requirements

- Ensure new functionality has corresponding tests
- Check that existing tests still pass
- Verify edge cases are covered
