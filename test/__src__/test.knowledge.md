# Testing Guidelines

## Testing Whitespace and Indentation

When testing diff block parsing:

1. Test indentation preservation:
   - Include tests for languages where indentation is significant (e.g., Python)
   - Verify parser can handle search/replace blocks with different indentation than source
   - Test both spaces and tabs for indentation

2. Test format variations:
   - Single-line vs multiline formats (e.g., imports)
   - Different whitespace patterns for the same logical code
   - Mixed indentation levels within a single block

3. Key assertions to include:
   - Verify no diff blocks failed to match
   - Check both searchContent and replaceContent preserve original formatting
   - Ensure indentation levels match source file exactly

Remember: The parser should be flexible in accepting search/replace blocks with simplified indentation while preserving the original source formatting.

## Code Block Detection

When detecting truncated code blocks:
- Check for explicit phrases like "rest of the"
- Match comment patterns with ellipsis: `// ... code ...`
- Support multiple comment styles: //, #, /* */
- Avoid false positives from regular ellipsis usage in comments
- Only match comments containing specific words: rest, unchanged, keep, file, existing, some

## Code Block Detection

When detecting truncated code blocks:
- Check for explicit phrases like "rest of the"
- Match comment patterns with ellipsis: `// ... code`
- Support multiple comment styles:
  - C-style single line: `// ... code`
  - C-style multi-line: `/* ... code */`
  - Python/Ruby style: `# ... code`
  - HTML style: `<!-- ... code -->`
  - SQL/Haskell style: `-- ... code`
  - MATLAB style: `% ... code`
  - JSX style: `{/* ... code */}`
- Avoid false positives from regular ellipsis usage in comments
- Only match comments containing specific words: rest, unchanged, keep, file, existing, some
- Second ellipsis is optional in all patterns (e.g. `// ... code` or `// ... code ...`)

## Database Mocking Guidelines

When mocking database queries:

1. Chain methods properly:
   - Mock all methods in the query chain (select, from, where, groupBy, etc.)
   - Return appropriate objects with next methods in chain
   - Pay special attention to groupBy and then methods

2. Return consistent test data:
   - Match the shape of real database responses
   - Include all fields referenced in tests
   - Use realistic dates/values that won't cause test failures

3. Important: Do not use XML-style tags (like <search>) in test code unless specifically editing files through the assistant. These tags are for file editing only, not for regular code.

## Quota Management Testing

When writing tests for the quota management system:

1. Date Comparisons:
   - Use a buffer when comparing dates to account for processing time
   - Example: `expect(result.endDate.getTime()).toBeGreaterThan(pastDate.getTime() - 1000)`
   - For exact date matches, convert both dates to ISO strings first
   - When mocking dates from DB, always use toISOString() to match DB format

2. Credit Values:
   - Always reference CREDITS_USAGE_LIMITS constants instead of hardcoding values
   - Remember values differ between local and production environments
   - Test both environments if values affect test logic

3. Mock Data Structure:
   - Database mocks must return creditsUsed as a string for message table sums
   - QuotaManager handles string-to-number conversion internally
   - Tests should expect numbers in assertions, not strings
   - Ensure subscription_active is explicitly set in mock data
   - Include all required fields: creditsUsed, quota, endDate, subscription_active
   - For subscription tests, include stripe_customer_id and stripe_price_id
   - Remember: While DB returns strings, tests work with the converted number values

## Test Infrastructure

### Tree-Sitter Test Isolation

When writing tests that don't need tree-sitter functionality:
- Place tests in a separate directory (e.g., `__tests__/browser/`)
- Create a jest.mock() for tree-sitter in the test file itself
- Don't rely on global mocks or setup files which may not be loaded in the right order
- Mock tree-sitter at the top of each test file that could trigger its load:
  ```typescript
  jest.mock('tree-sitter', () => ({}))
  ```
