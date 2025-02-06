# String Utilities

## Implementation Guidelines

### Pluralization
- Consider all cases when implementing word transformations:
  - Zero quantity may need special handling
  - Negative numbers
  - Decimal numbers
  - Language/locale specific rules
  - Irregular plurals (e.g., child -> children)
  - Words ending in y: only change to 'ies' if preceded by a consonant (e.g., "fly" -> "flies" but "day" -> "days", "key" -> "keys")
  - Words ending in s, ch, sh, x: add 'es'
  - Special suffixes (-es, -ies)

Simple implementations can lead to bugs. Prefer using established i18n/l10n libraries for production text transformations.

### General String Transformation Guidelines
- Avoid quick, simple implementations for language-specific transformations
- Consider edge cases before implementing string manipulation functions
- Document assumptions and limitations in comments
- For text displayed to users, use i18n libraries rather than custom implementations
- Test with a variety of inputs including:
  - Empty strings
  - Special characters
  - Unicode/emoji
  - Very long strings
  - Different locales

### JSON in Strings Pattern
When modifying JSON content within strings:
- Use regex to extract the specific JSON portion first
- Parse the extracted content to work with it as an object
- Make modifications to the parsed object
- Stringify the modified content
- Use regex replacement to put it back in the original string
- Always include fallback behavior if parsing fails
- Extract transformation logic into a reusable helper function:
  ```

### Message Content Pattern
When transforming message content:
- Filter out unwanted content types before transformation
- Use ts-pattern's match for type-safe content handling
- Avoid producing null values that would need filtering
- Example pattern:
  ```typescript
  match(message)
    .with({ content: P.array() }, (msg) => ({
      ...msg,
      content: msg.content.reduce<typeof msg.content>(
        (acc, contentObj) => [
          ...acc,
          ...match(contentObj)
            .with({ type: 'unwanted-type' }, () => [])
            .with({ type: 'specific-type', content: P.string }, (obj) => [{
              ...obj,
              content: transform(obj.content)
            }])
            .with({ type: 'text', text: P.string }, (obj) => [{
              ...obj,
              text: transform(obj.text)
            }])
            .otherwise((obj) => [obj])
        ],
        []
      )
    }))
    .with({ content: P.string }, handleString)
    .otherwise(msg => msg)
  ```

The pattern above combines filtering and transformation:
- Uses reduce to handle filtering and transformation in a single pass
- Each match case returns an array (even for filtering - returns empty array)
- Spreads match results into accumulator for consistent array handling
- Avoids intermediate arrays from map+filter chain
- More declarative and efficient than separate operations
- Keeps all type handling in one placetypescript
  const transformJsonInString = <T = unknown>(
    content: string,
    field: string,
    transform: (json: T) => unknown,
    fallback: string
  ): string => {
    const pattern = new RegExp(`"${field}"\\s*:\\s*(\\[[^\\]]*\\]|\\{[^}]*\\})`)
    const match = content.match(pattern)
    if (!match) return content

    try {
      const json = JSON.parse(match[1])
      const transformed = transform(json)
      return content.replace(
        new RegExp(`"${field}"\\s*:\\s*\\[[^\\]]*\\]|\\{[^}]*\\}`, 'g'),
        `"${field}":${JSON.stringify(transformed)}`
      )
    } catch {
      return content.replace(
        new RegExp(`"${field}"\\s*:\\s*\\[[^\\]]*\\]|\\{[^}]*\\}`, 'g'),
        `"${field}":${fallback}`
      )
    }
  }
  ```
- This pattern supports both arrays and objects
- Provides clean error handling with fallbacks
- Makes transformations declarative and reusable
- Use generic type parameter to ensure type safety:
  ```typescript
  // Example with typed array
  transformJsonInString<Array<{ source?: string }>>(
    content,
    'logs',
    (logs) => logs.filter(log => log?.source === 'tool'),
    '[]'
  )
  ```
