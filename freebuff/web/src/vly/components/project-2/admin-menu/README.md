# Admin Quick Menu - Modular Structure

This directory contains the refactored Admin Quick Menu, split into logical modules to improve maintainability and reduce duplication.

## Directory Structure

```
admin-menu/
├── constants.ts           # All constant definitions (credit types, flags, labels)
├── types.ts              # TypeScript interfaces and types
├── utils.ts              # Utility functions (formatting, calculations)
├── hooks.ts              # Custom React hooks for data fetching and state management
├── README.md             # This file
├── shared/               # Reusable UI components
│   ├── SectionHeader.tsx
│   ├── PauseStatusBadge.tsx
│   ├── CreditBalanceDisplay.tsx
│   ├── LoadingState.tsx
│   └── EmptyState.tsx
├── user/                 # User-scoped features
│   ├── UserSelector.tsx
│   ├── UserCreditsTab.tsx     # TODO: Extract from main file
│   ├── UserInfoTab.tsx        # TODO: Extract from main file
│   ├── UserPauseTab.tsx       # TODO: Extract from main file
│   └── UserProjectsTab.tsx    # TODO: Extract from main file
├── project/              # Project-scoped features
│   ├── ProjectPauseTab.tsx    # TODO: Extract from main file
│   ├── ProjectAccessTab.tsx   # TODO: Extract from main file
│   └── ProjectDeploymentsTab.tsx  # TODO: Extract from main file
└── system/               # System-wide features
    ├── FeatureFlagsSection.tsx    # TODO: Extract from main file
    ├── PlatformStatsSection.tsx   # TODO: Extract from main file
    └── GlobalSettingsSection.tsx  # TODO: Extract from main file
```

## Key Improvements

### 1. Separation of Concerns

- **Constants**: All magic strings and configuration in one place
- **Types**: Clear type definitions for better IDE support
- **Utils**: Pure functions that can be easily tested
- **Hooks**: Encapsulate data fetching and complex state logic

### 2. Reduced Duplication

- **Shared Components**: Reusable UI patterns (section headers, badges, loading states)
- **Credit Display**: Single component for showing credit balances
- **Pause Status**: Unified pause status display across user and project tabs

### 3. Better Testability

- Small, focused components are easier to unit test
- Pure utility functions can be tested in isolation
- Hooks can be tested with React Testing Library

### 4. Improved Maintainability

- Each file has a clear, single responsibility
- Changes to UI patterns only need to be made in one place
- Easier to onboard new developers

## Usage Example

```tsx
import { AdminQuickMenu } from "./AdminQuickMenu";
import { Id } from "@/convex/_generated/dataModel";

// In your component
<AdminQuickMenu
  open={isOpen}
  onOpenChange={setIsOpen}
  projectId={projectId as Id<"project">}
/>;
```

## Migration Status

### ✅ Completed

- [x] Directory structure
- [x] Constants extraction
- [x] Types extraction
- [x] Utils extraction
- [x] Shared components (SectionHeader, PauseStatusBadge, CreditBalanceDisplay, LoadingState, EmptyState)
- [x] UserSelector component
- [x] Hooks module (useUserSearch, useCreditManagement, usePauseManagement, useFeatureFlags)

### 🚧 In Progress

- [ ] User tab components (UserCreditsTab, UserInfoTab, UserPauseTab, UserProjectsTab)
- [ ] Project tab components
- [ ] System tab components
- [ ] Main AdminQuickMenu refactor to use new modules

### 📝 Next Steps

1. Extract remaining tab components from the monolithic file
2. Update AdminQuickMenu.tsx to import and compose the new modules
3. Test all functionality to ensure no regressions
4. Remove old code after verification

## Development Guidelines

### Adding New Constants

Add to `constants.ts` and export for reuse across components.

### Creating New Components

1. Determine the scope (user/project/system/shared)
2. Place in the appropriate directory
3. Import types from `../types`
4. Import constants from `../constants`
5. Import utilities from `../utils`
6. Use shared components where appropriate

### Adding New Hooks

Add to `hooks.ts` and follow the existing patterns for:

- Loading states
- Error handling
- Toast notifications
- Data refetching

## Performance Considerations

- Lazy loading of tab content through conditional queries (`"skip"` parameter)
- Debounced search to reduce API calls
- Memoized computed values where appropriate
- Conditional rendering to avoid unnecessary re-renders

## Accessibility

- Proper ARIA labels on interactive elements
- Keyboard navigation support
- Focus management in popovers and dialogs
- Screen reader friendly loading and error states
