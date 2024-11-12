# String Utilities

## Implementation Guidelines

### Pluralization
- Consider all cases when implementing word transformations:
  - Zero quantity may need special handling
  - Negative numbers
  - Decimal numbers
  - Language/locale specific rules
  - Irregular plurals (e.g., child -> children)
  - Words ending in y, s, ch, sh, x
  - Special suffixes (-es, -ies)

Simple implementations can lead to bugs. Prefer using established i18n/l10n libraries for production text transformations.
