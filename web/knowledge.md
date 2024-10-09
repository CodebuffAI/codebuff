<!-- ... existing knowledge file ... -->

## Data Fetching and State Management

### Using TanStack Query (React Query)

For efficient data fetching and state management in React components, we use TanStack Query (formerly known as React Query). This library provides a powerful and flexible way to fetch, cache, and update data in React applications.

Key points:

- Install the library: `npm install @tanstack/react-query` or `yarn add @tanstack/react-query`
- Use the `useQuery` hook for data fetching in components
- Implement query invalidation and refetching strategies for real-time updates
- Utilize the built-in caching mechanism to improve performance

Important: Before using useQuery in components, you must set up the QueryClientProvider in your app's root layout. Here's how to do it:

1. Create a QueryClient instance in your root layout file (e.g., `web/src/app/layout.tsx`):

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Your existing layout structure */}
      {children}
    </QueryClientProvider>
  )
}
```

2. Wrap your entire application with the QueryClientProvider to make the QueryClient available to all components.

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

## UI Components and Loading States

### shadcn/ui Components

We use shadcn/ui components for consistent and customizable UI elements. To add new components:

1. Use the shadcn-ui CLI command:
   ```
   npx shadcn-ui@latest add [component-name]
   ```
2. If the CLI command fails, manually add the component file to the `web/src/components/ui/` directory.

### Skeleton Component for Loading States

The Skeleton component from shadcn/ui is used for creating loading state placeholders. It's located at `web/src/components/ui/skeleton.tsx`.

When implementing loading states, especially with TanStack Query, use the Skeleton component within the existing layout structure. For example:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// Inside your component's JSX
{isLoading ? (
  <Card>
    <CardHeader>
      <Skeleton className="h-8 w-3/4" />
    </CardHeader>
    <CardContent>
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-5/6" />
    </CardContent>
  </Card>
) : (
  // Render actual content
)}
```
