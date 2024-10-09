<!-- ... existing knowledge file ... -->

## Data Fetching and State Management

### Using TanStack Query (React Query)

For efficient data fetching and state management in React components, we use TanStack Query (formerly known as React Query). This library provides a powerful and flexible way to fetch, cache, and update data in React applications.

Key points:
- Install the library: `npm install @tanstack/react-query` or `yarn add @tanstack/react-query`
- Use the `useQuery` hook for data fetching in components
- Implement query invalidation and refetching strategies for real-time updates
- Utilize the built-in caching mechanism to improve performance

Example usage:

```typescript
import { useQuery } from '@tanstack/react-query'

const fetchReferrals = async () => {
  const response = await fetch('/api/referrals')
  if (!response.ok) {
    throw new Error('Failed to fetch referral data')
  }
  return response.json()
}

const ReferralsPage = () => {
  const { data, isLoading, error } = useQuery(['referrals'], fetchReferrals)

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  // Render referrals data
}
```

Benefits:
1. Automatic caching and background refetching
2. Loading and error states management
3. Simplified data synchronization across components
4. Improved performance and user experience

When implementing new features or refactoring existing ones, prefer using TanStack Query for data fetching and state management to maintain consistency across the application.

<!-- ... rest of the knowledge file ... -->
