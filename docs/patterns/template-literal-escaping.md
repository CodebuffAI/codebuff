# Template Literal Escaping Pattern

When modifying JavaScript/TypeScript code that contains template literals (backtick strings), always escape backticks that appear within the template literal content to prevent syntax errors.

## The Problem

Template literals use backticks (`) as delimiters. When you have backticks inside the template literal content, they must be escaped or they will break the JavaScript syntax.

**WRONG:**
```typescript
const message = `Use \`wait-idle\` with send** (e.g., `--wait-idle 3`) to wait for output`
//                                              ^ unescaped backtick breaks syntax
```

**CORRECT:**
```typescript
const message = `Use \`wait-idle\` with send** (e.g., \`--wait-idle 3\`) to wait for output`
//                                              ^ properly escaped backticks
```

## When This Happens

This issue commonly occurs when:
- Modifying documentation strings that contain code examples with backticks
- Updating help text or error messages that reference command-line syntax
- Changing template literals that contain markdown-style code formatting
- Replacing text that includes shell command examples

## The Fix

When working inside template literals, escape all backticks in the content:

1. **Find all backticks** in the string content (not the template literal delimiters)
2. **Escape each one** with a backslash: `` ` `` becomes `` \` ``
3. **Verify the syntax** - the opening and closing backticks of the template literal should be the only unescaped ones

## Examples from Real Code

### Helper Script Documentation
```typescript
// WRONG - breaks compilation
const helperScript = `
  echo "Commands: send, capture, wait-idle"
  # Usage example: helper wait-idle "session" 3
  echo "Use \`--wait-idle 3\` for timing"
`

// CORRECT - properly escaped
const helperScript = `
  echo "Commands: send, capture, wait-idle"
  # Usage example: helper wait-idle "session" 3
  echo "Use \\\`--wait-idle 3\\\` for timing"
`
```

### Quick Reference Strings
```typescript
// WRONG
const quickRef = 
  '- Send + wait: `' + helperPath + ' send "' + sessionName + '" "..." --wait-idle 3`\n' +
  '- Example usage: `--wait-idle 3` waits for output\n'
//                  ^ unescaped backticks in concatenated string

// CORRECT  
const quickRef = 
  '- Send + wait: `' + helperPath + ' send "' + sessionName + '" "..." --wait-idle 3`\n' +
  '- Example usage: \`--wait-idle 3\` waits for output\n'
//                  ^ properly escaped backticks
```

## Detection

Syntax errors from unescaped backticks typically show:
- `TS1005: ',' expected` or `TS1005: ';' expected`
- `TS1003: Identifier expected`
- `error: Expected "}" but found "<word>"`
- Compilation errors pointing to the line with unescaped backticks

## Prevention

1. **When modifying template literals**, scan for all backticks in the content
2. **Use find-and-replace** to systematically escape backticks: find `` ` `` replace with `` \` ``
3. **Test compilation** after making changes to catch syntax errors early
4. **Be extra careful** with documentation strings, help text, and code examples

## Key Rule

Inside template literals, the only unescaped backticks should be the opening and closing delimiters of the template literal itself. All backticks in the content must be escaped with backslashes.