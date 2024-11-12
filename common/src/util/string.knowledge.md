# String Utilities

## Implementation Guidelines

### Pluralization
- Consider all cases when implementing word transformations:
  - Zero quantity may need special handling
  - Negative numbers
  - Decimal numbers
  - Language/locale specific rules
  - Irregular plurals (e.g., child -> children)
  - Words ending in y: only change to 'ies' if preceded by a consonant (e.g., "fly" -> "flies" but "day" -> "days")
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
