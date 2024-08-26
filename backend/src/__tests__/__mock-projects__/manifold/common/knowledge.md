# Common Knowledge

## User Authentication and Permissions

### Checking Admin Status

To check if a user is an admin, use the `isAdminId` function from `common/envs/constants` instead of checking for an `isAdmin` property on the user object.

Example:
```typescript
import { isAdminId } from 'common/envs/constants'

// Correct way to check if a user is an admin
if (user && isAdminId(user.id)) {
  // Admin-specific code here
}

// Incorrect way (do not use)
// if (user?.isAdmin) { ... }
```

This ensures consistent admin checks across the application and avoids errors related to non-existent properties.

