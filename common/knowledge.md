# Common Package Knowledge

This package contains code shared between the `web` (Next.js frontend/backend) and `backend` (CLI backend) packages.

## Key Areas

- **Database (`src/db`)**: Contains Drizzle ORM schema (`schema.ts`), configuration, and migration logic.
- **Utilities (`src/util`)**: Shared helper functions.
- **Types (`src/types`)**: Shared TypeScript types and interfaces.
- **Constants (`src/constants`)**: Shared constant values.

## Important Notes

### Crypto Utilities (`src/util/crypto.ts`)

- Provides functions for encrypting/decrypting and storing sensitive data like API keys (`encryptAndStoreApiKey`, `retrieveAndDecryptApiKey`, `clearApiKey`).
- **Security**: These functions **require** the 32-byte `API_KEY_ENCRYPTION_SECRET` to be passed in as a `secretKey` parameter from the calling environment (`web` or `backend`). The secret itself must **never** be stored or exposed in the `common` package.
- The calling environment is responsible for retrieving the secret from its respective `env.mjs` file.

### Database Migrations

- Schema is defined in `common/src/db/schema.ts`.
- Migrations are managed using `drizzle-kit`.
- Run `bun run --cwd common db:generate` to create new migration files after schema changes.
- Run `bun run --cwd common db:migrate` to apply pending migrations to the database.