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
