# String Utilities

## Pluralization Implementation

The `pluralize` function handles:

- Words ending in 'y' preceded by consonant: change to 'ies' (fly → flies)
- Words ending in 'y' preceded by vowel: add 's' (day → days)
- Words ending in s, x, z, sh, ch, o: add 'es'
- Words ending in 'f': change to 'ves'
- Words ending in 'fe': change to 'ves'
- Default: add 's'

**Note**: For production text transformations, prefer established i18n/l10n libraries over simple implementations.

## JSON in Strings Pattern

The `transformJsonInString` function:

- Uses non-greedy regex to match JSON objects/arrays in strings
- Parses, transforms, and replaces the exact matched portion
- Provides fallback behavior on parse errors
- Supports generic typing for type safety

Example usage:

```typescript
transformJsonInString<Array<{ source?: string }>>(
  content,
  'logs',
  (logs) => logs.filter((log) => log?.source === 'tool'),
  '[]',
)
```

## Placeholder Comment Replacement

The `replaceNonStandardPlaceholderComments` function handles multiple comment styles:

- C-style: `//` and `/* */`
- Python/Ruby: `#`
- HTML: `<!-- -->`
- SQL/Haskell: `--`
- MATLAB: `%`
- JSX: `{/* */}`

Matches patterns containing words like "rest", "unchanged", "keep", "file", "existing", "some" with ellipsis.

## Other Key Functions

- `hasLazyEdit`: Detects placeholder comments in content
- `generateCompactId`: Creates unique IDs using timestamp + random bits
- `stripNullChars`/`stripAnsi`/`stripColors`: Text cleaning utilities
- `suffixPrefixOverlap`: Finds overlapping substrings for concatenation
