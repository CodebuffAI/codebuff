# Internal Package

## Purpose

Centralized location for internal utilities, environment configuration, and select integrations used across the Codebuff monorepo (`backend` and `web`).

## Structure

- `env.ts`: Environment variable validation using @t3-oss/env-nextjs
- `utils/auth.ts`: Admin authentication utilities and auth token validation
- `loops/`: Email service integration for transactional emails

## Environment Variables

All environment variables are defined and validated in `env.ts`:

- Server variables: API keys, database URLs, service credentials
- Client variables: Public configuration values
- Uses Infisical for secret management in development

## Current Integrations

### Loops Email Service

- **Purpose**: Transactional emails (invitations, basic messages)
- **Functions**: `sendOrganizationInvitationEmail`, `sendBasicEmail`, `sendSignupEventToLoops`
- **Environment**: Requires `LOOPS_API_KEY`

### Auth Utilities

- **Purpose**: Admin user verification and session validation
- **Functions**: `checkAuthToken`, `checkSessionIsAdmin`, `isCodebuffAdmin`
- **Usage**: Used by admin routes and protected endpoints
