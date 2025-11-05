# Codebuff Web App

Mainly used for logging in and managing Codebuff API quotas.

## 🎉 Features

- 🚀 Next.js 14 (App router)
- ⚛️ React 18
- 📘 Typescript
- 🎨 TailwindCSS - Class sorting, merging and linting
- 🛠️ Shadcn/ui - Customizable UI components
- 💵 Stripe - Payment handler
- 🔒 Next-auth - Easy authentication library for Next.js (GitHub provider)
- 🛡️ Drizzle - ORM for node.js
- 📋 React-hook-form - Manage your forms easy and efficient
- 🔍 Zod - Schema validation library
- 🧪 Jest & React Testing Library - Configured for unit testing
- 🎭 Playwright - Configured for e2e testing
- 📈 Absolute Import & Path Alias - Import components using `@/` prefix
- 💅 Prettier - Code formatter
- 🧹 Eslint - Code linting tool
- 🐶 Husky & Lint Staged - Run scripts on your staged files before they are committed
- 🔹 Icons - From Lucide
- 🌑 Dark mode - With next-themes
- 📝 Commitlint - Lint your git commits
- 🤖 Github actions - Lint your code on PR
- ⚙️ T3-env - Manage your environment variables
- 🗺️ Sitemap & robots.txt
- 💯 Perfect Lighthouse score

## How to Set Up Locally

1. Copy `.env.example` to `.env` and fill in the values.
   `cp .env.example .env`
2. Run `bun install` to install dependencies
3. Run `bun run db:generate` to create migration files (if they differ from schema)
4. Run `bun run db:migrate` to apply migrations
5. Run `bun run dev` to start the server

## 📁 Project structure

```bash
.
├── .github                         # GitHub folder
├── .husky                          # Husky configuration
├── db                              # Database schema and migrations
├── public                          # Public assets folder
└── src
    ├── __tests__                   # Unit and e2e tests
    ├── actions                     # Server actions
    ├── app                         # Next JS App (App Router)
    ├── components                  # React components
    ├── hooks                       # Custom hooks
    ├── lib                         # Functions and utilities
    ├── styles                      # Styles folder
    ├── types                       # Type definitions
    └── env.mjs                     # Env variables config file
```

## ⚙️ Scripts overview

The following scripts are available in the `package.json`:

- `dev`: Run development server
- `db:generate`: Generate database migration files
- `db:migrate`: Apply database migrations
- `build`: Build the app
- `start`: Run production server
- `preview`: Run `build` and `start` commands together
- `lint`: Lint the code using Eslint
- `lint:fix`: Fix linting errors
- `format:check`: Checks the code for proper formatting
- `format:write`: Fix formatting issues
- `typecheck`: Type-check TypeScript without emitting files
- `test`: Run unit tests
- `test:watch`: Run unit tests in watch mode
- `e2e`: Run end-to-end tests
- `e2e:ui`: Run end-to-end tests with UI
- `prepare`: Install Husky for managing Git hooks

## SEO & SSR

- Store SSR: `src/app/store/page.tsx` renders agents server-side using cached data (ISR `revalidate=600`).
- Client fallback: `src/app/store/store-client.tsx` only fetches `/api/agents` if SSR data is empty.
- Dynamic metadata:
  - Store: `src/app/store/page.tsx`
  - Publisher: `src/app/publishers/[id]/page.tsx`
  - Agent detail: `src/app/publishers/[id]/agents/[agentId]/[version]/page.tsx`

### Warm the Store cache

The agents cache is automatically warmed to ensure SEO data is available immediately:

1. **Build-time validation**: `scripts/prebuild-agents-cache.ts` runs after `next build` to validate the database connection and data pipeline
2. **Health check warming** (Primary): `/api/healthz` endpoint warms the cache when Render performs health checks before routing traffic

On Render, set the Health Check Path to `/api/healthz` in your service settings to ensure the cache is warm before traffic is routed to the app.

### E2E tests for SSR and hydration

- Hydration fallback: `src/__tests__/e2e/store-hydration.spec.ts` - Tests client-side data fetching when SSR data is empty
- SSR HTML: `src/__tests__/e2e/store-ssr.spec.ts` - Tests server-side rendering with JavaScript disabled

Both tests use Playwright's `page.route()` to mock API responses without polluting production code.

Run locally:

```
cd web
bun run e2e
```

<!-- Lighthouse CI workflow removed for now. Reintroduce later if needed. -->
