# Integrations Package Plan

## Overview
Create a new `packages/integrations` package to house all third-party service integrations, starting with Loops email functionality. This will provide a clean separation of concerns and make it easy to share integrations between backend and web.

## Package Structure
```
packages/integrations/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── loops/
│   │   ├── index.ts
│   │   ├── client.ts
│   │   └── types.ts
│   └── knowledge.md
└── dist/ (generated)
```

## Implementation Steps

### 1. Create Package Structure
- Create `packages/integrations/` directory
- Set up `package.json` with dependencies:
  - `common` (workspace dependency)
  - `loops` (npm package for Loops SDK)
  - Standard dev dependencies (TypeScript, etc.)
- Create `tsconfig.json` extending base config
- Add to workspace configuration

### 2. Implement Loops Integration
Create `packages/integrations/src/loops/` module with:

#### `client.ts`
- Initialize Loops client using `LOOPS_API_KEY` environment variable
- Core `sendTransactionalEmail` function wrapping Loops SDK
- Error handling and logging

#### `types.ts`
- `LoopsEmailData` interface (moved from web)
- Response types
- Configuration types

#### `index.ts`
- Export specific email functions:
  - `sendOrganizationInvitationEmail(data: LoopsEmailData)`
  - `sendOrganizationWelcomeEmail(data: LoopsEmailData)`
  - `sendBasicEmail(email: string, data: { subject: string, message: string })`
- Export types and client

### 3. Refactor Existing Code

#### Backend Changes
- Update `evals/git-evals/email-eval-results.ts` to import from `@codebuff/integrations`
- Remove `backend/src/util/loops.ts`

#### Web Changes
- Update API routes in `web/src/app/api/orgs/` to import from `@codebuff/integrations`
- Remove `web/src/lib/loops-email.ts`

### 4. Configuration
- Add package to monorepo workspace
- Update build scripts if needed
- Ensure proper TypeScript path mapping

### 5. Documentation
- Create `packages/integrations/src/knowledge.md` explaining:
  - Purpose of the package
  - How to add new integrations
  - Usage examples
  - Environment variable requirements

## Transactional IDs
Preserve existing transactional IDs:
- Organization invitation: `'cmbikixxm15xo4a0iiemzkzw1'`
- Organization welcome: `'organization-welcome'`
- Subject/message: `'cmb8pafk92r820w0i7lkplkt2'`

## Benefits
- Clean separation of third-party integrations
- Shared code between backend and web
- Consistent error handling and logging
- Easy to add future integrations (Stripe, etc.)
- Follows existing package patterns in the monorepo

## Future Integrations
This package structure will accommodate:
- Stripe client (shared utilities)
- BigQuery (migrated from existing package)
- Other third-party services as needed
