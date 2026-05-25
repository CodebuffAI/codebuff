# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Setup and Development

```bash
# Install dependencies (uses pnpm)
pnpm install

# Run development servers (Next.js frontend + Convex backend)
pnpm dev

# Individual dev servers
pnpm dev:frontend  # Next.js dev server
pnpm dev:backend   # Convex dev server
```

### Code Quality

```bash
# Lint code
pnpm lint

# Format code
pnpm format

# Type checking (run automatically in pre-commit hook)
npx tsc --noEmit
```

### Build and Deployment

```bash
# Build production bundle
pnpm build

# Start production server
pnpm start
```

## Architecture Overview

This is a **Next.js 15** application with **Convex** as the backend, using **Clerk** for authentication. The project appears to be a collaborative coding platform with CodeSandbox integration.

### Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Convex (real-time database and serverless functions)
- **Authentication**: Clerk
- **UI Components**: Radix UI, shadcn/ui patterns
- **Integrations**: CodeSandbox SDK, GitHub API (via Octokit), OpenAI, PostHog analytics
- **Styling**: Tailwind CSS with custom animations

### Directory Structure

```
crack/
├── app/                  # Next.js App Router pages
│   ├── (auth)/          # Authentication pages (login, signup)
│   ├── (legal)/         # Legal pages (terms, privacy)
│   ├── admin/           # Admin dashboard
│   ├── dashboard/       # User dashboard
│   ├── project/[id]/    # Dynamic project pages
│   └── providers.tsx    # Client providers (PostHog)
├── components/          # React components
│   ├── ui/             # Reusable UI components
│   ├── pages/          # Page-specific components
│   └── project*/       # Project-related components
├── convex/             # Backend functions and schema
│   ├── schema.ts       # Database schema definitions
│   ├── auth.config.ts  # Authentication configuration
│   ├── codesandbox/    # CodeSandbox integration functions
│   ├── github/         # GitHub integration functions
│   └── _generated/     # Auto-generated Convex types
├── hooks/              # Custom React hooks
├── lib/                # Utility functions and helpers
└── codebase-utils/     # Code analysis utilities
```

## Convex Development Guidelines

NEVER USE RETURN TYPE VALIDATORS. Convex functions should not be having them.

### Database Queries

- Use indexes via `withIndex()` instead of `filter()` for performance
- Name indexes descriptively: `by_field1_and_field2`
- For deletion: collect results first, then iterate with `ctx.db.delete()`

### Function Types

- **Public**: `query`, `mutation`, `action` (exposed to frontend)
- **Internal**: `internalQuery`, `internalMutation`, `internalAction` (backend only)
- Reference via `api.filename.functionName` or `internal.filename.functionName`

## Project-Specific Patterns

### Authentication Flow

- Clerk handles user authentication
- User data synced to Convex `users` table via `clerk_id`
- Protected routes use Clerk's middleware

### Project Management

- Projects stored in Convex with CodeSandbox integration
- Semantic identifiers for user-friendly URLs
- Real-time updates via Convex subscriptions

### Component Architecture

- Client components marked with `"use client"`
- Error boundaries wrap feature components
- Providers composed in layout files
- Suspense boundaries for async components

### State Management

- Server state: Convex queries/mutations with real-time subscriptions
- Client state: React hooks and context
- URL state: Next.js router for navigation

## Environment Variables

Required variables in `.env.local`:

- `CONVEX_DEPLOYMENT` - Convex deployment identifier
- `NEXT_PUBLIC_CONVEX_URL` - Convex instance URL
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `CLERK_SECRET_KEY` - Clerk secret key
- `NEXT_PUBLIC_POSTHOG_KEY` - PostHog analytics key
- `NEXT_PUBLIC_GRAVITY_API_KEY` - Gravity ad API key for contextual ads in agent chat. Get from [Gravity Dashboard](https://app.trygravity.ai/publisher/login). If unset, ad slots render nothing. Use `testAd: true` (e.g. in GravityAdSlot) for placeholder ads during development. Fetched client-side to avoid Convex action compute costs.

## Testing & Quality

### Pre-commit Hooks

Automatically runs via Husky:

1. `lint-staged` - Formats and lints changed files
2. `tsc --noEmit` - Type checking

### Code Style

- Prettier for formatting (configured in `.prettierrc`)
- ESLint for linting (Next.js configuration)
- TypeScript strict mode enabled
