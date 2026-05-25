# Split Document Editor into Landing and Project Views

## Structure

```
app/
  page.tsx (Landing with demo editor)
  project/
    [id]/
      page.tsx (Project-specific editor)
components/
  document-editor/
    DocumentEditor.tsx (Base editor with marketing)
    ProjectEditor.tsx (Clean editor for projects)
    shared/
      Editor.tsx (Common editor functionality)
      ChatInterface.tsx
      SpawnButton.tsx
```

## Implementation Steps

1. Create shared editor component with common functionality:

   - Editor content handling
   - Chat interface
   - Project spawning
   - Remove marketing-specific elements

2. Create ProjectEditor component:

   - Use shared editor
   - Add project-specific features
   - Remove hero/marketing
   - Add project header with metadata

3. Update DocumentEditor for landing:

   - Use shared editor
   - Keep marketing elements
   - Keep demo flow

4. Create project route:

   - Dynamic route for [id]
   - Project data fetching
   - Authorization checks
   - Use ProjectEditor component

5. Update landing page:
   - Keep existing demo flow
   - Use DocumentEditor component
   - Add navigation to project after creation
