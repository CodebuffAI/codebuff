# File Architecture Redesign Plan

## Overview
Redesign file handling to optimize prompt caching by separating base files (in system prompt) from additional files (in message tool results), with robust token management.

## Core Data Structure Updates

### ProjectFileContext Changes
```typescript
interface ProjectFileContext {
  // ... existing fields ...
  baseFiles: FileVersion[]  // Knowledge files + initial context
  // Remove fileVersions array - rely on messages for additional files
}

interface FileVersion {
  path: string
  content: string
}
```

### Message Processing
- Parse additional files from message tool results
- Track file paths and content in tool results
- Support both full content and truncated references

## Implementation Phases

### Phase 1: Base File Integration

1. Update ProjectFileContext:
   - Add baseFiles array for knowledge files
   - Remove fileVersions array
   - Update initialization to populate baseFiles

2. Modify getAgentSystemPrompt:
   - Use only baseFiles in system prompt
   - Remove fileVersions handling
   - Maintain stable prompt structure

### Phase 2: Message-Based File Handling

1. Tool Result Enhancement:
   - Update read_files tool result format
   - Support both full and truncated content
   - Example format:
   ```typescript
   interface ReadFilesResult {
     type: 'read_files'
     files: {
       path: string
       content?: string  // Omitted when truncated
       truncated?: boolean
     }[]
   }
   ```

2. File Content Extraction:
   - Add utilities to parse files from messages
   - Track which files are referenced
   - Maintain file order

### Phase 3: Token Management

1. Update getFileVersionUpdates:
   - Track total token usage across files
   - Implement token limit checks
   - Support content reset operation

2. Content Reset Process:
   - Identify when token limit is reached
   - Edit existing tool results to remove content
   - Keep file path references
   - Select priority files for base content

3. File Selection Logic:
   - Implement smart file selection
   - Consider file relevance and size
   - Preserve critical files
   - Example reset operation:
   ```typescript
   // Before reset
   {
     type: 'read_files',
     files: [{
       path: 'file1.ts',
       content: '... full content ...'
     }]
   }
   
   // After reset
   {
     type: 'read_files',
     files: [{
       path: 'file1.ts',
       truncated: true
     }]
   }
   ```

### Phase 4: Cache Optimization

1. Message Processing:
   - Parse files from previous messages
   - Track file references without duplication
   - Maintain cache consistency

2. System Prompt Stability:
   - Ensure base files remain stable
   - Handle knowledge file updates
   - Preserve prompt cache

## Implementation Steps

1. Core Structure Updates:
   - Update ProjectFileContext schema
   - Modify file version handling
   - Add base file support

2. Message Integration:
   - Update tool result formats
   - Add file parsing utilities
   - Implement content tracking

3. Token Management:
   - Add token tracking
   - Implement reset logic
   - Update file selection

4. Cache Handling:
   - Update prompt generation
   - Modify file rendering
   - Optimize caching

## Testing Strategy

1. Unit Tests:
   - Base file handling
   - Message parsing
   - Token management
   - Content reset

2. Integration Tests:
   - End-to-end file operations
   - Token limit scenarios
   - Cache preservation

## Success Criteria

1. Efficient Cache Usage:
   - System prompt remains stable
   - File content properly tracked
   - No duplicate storage

2. Token Management:
   - Proper handling of limits
   - Smart file selection
   - Clean content reset

3. Functionality:
   - All file operations work
   - Order preserved
   - Knowledge files handled correctly