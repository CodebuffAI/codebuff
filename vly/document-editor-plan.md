# Document Editor Component Breakdown

## Component Structure

```
components/
  document-editor/
    Header.tsx
    Hero.tsx
    FeatureBox.tsx
    DocumentContainer.tsx
    ChatInterface.tsx
    Footer.tsx
    SpawnButton.tsx
    types.ts
```

## Implementation Steps

1. Create types file for shared interfaces
2. Create individual components
3. Create main DocumentEditor component that manages state
4. Update Entry component to use DocumentEditor
5. Test all transitions and interactions

## Component Details

### types.ts

```typescript
export type ContentState = "empty" | "typing" | "transitioning";
export type ChatMessage = { role: "user" | "agent"; content: string };
```

### Header.tsx

- Logo and theme toggle
- Takes isDarkMode and toggleTheme as props

### Hero.tsx

- Hero section with features
- Takes opacity and visibility props

### FeatureBox.tsx

- Individual feature box
- Takes icon, title, description as props

### DocumentContainer.tsx

- Main editor container
- Takes editor state and handlers as props

### ChatInterface.tsx

- Chat UI and logic
- Takes chat state and handlers as props

### Footer.tsx

- Status message
- Takes contentState as prop

### SpawnButton.tsx

- Floating button to spawn agent
- Takes visibility and click handler as props

## State Management

All state will be managed in the main DocumentEditor component and passed down as props.
