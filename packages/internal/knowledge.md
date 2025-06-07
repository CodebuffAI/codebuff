# Integrations Package

## Purpose
This package serves as a centralized location for all third-party service integrations within the Codebuff monorepo. The primary goal is to promote code reusability, maintain a clean separation of concerns, and provide a consistent way to interact with external services across different parts of the application (e.g., `backend` and `web`).

## Adding New Integrations
To add a new integration (e.g., for a service like Stripe, or another email provider):

1.  **Create a New Directory**: Inside `packages/integrations/src/`, create a new directory named after the service (e.g., `stripe/`).
2.  **Add Client Logic**: Implement the client for interacting with the service in a `client.ts` file within the new directory (e.g., `packages/integrations/src/stripe/client.ts`).
    *   Ensure API keys and other sensitive configurations are loaded from environment variables.
    *   Implement robust error handling and logging.
3.  **Define Types**: Create a `types.ts` file in the service's directory (e.g., `packages/integrations/src/stripe/types.ts`) to define any necessary interfaces or type aliases related to the service's data structures or API responses.
4.  **Create an Index File**: Add an `index.ts` barrel file in the service's directory (e.g., `packages/integrations/src/stripe/index.ts`) to export the public functions and types from `client.ts` and `types.ts`.
5.  **Export from Main Index**: Re-export the new integration's modules from the main `packages/integrations/src/index.ts` file. For example:
    ```typescript
    // packages/integrations/src/index.ts
    export * from './loops'; // Existing export
    export * from './stripe'; // New export for Stripe
    ```
6.  **Add Dependencies**: If the new integration requires an SDK or other npm packages, add them to `packages/integrations/package.json`.
7.  **Update Documentation**: Add a section to this `knowledge.md` file briefly describing the new integration and any specific usage notes or environment variables it requires.

## Current Integrations

### Loops
-   **Purpose**: Handles sending transactional emails (e.g., invitations, welcome messages) via the Loops.so API.
-   **Location**: `packages/integrations/src/loops/`
-   **Key Functions**: Provides functions for sending various types of pre-defined and basic emails.
-   **Environment Variables Required**:
    -   `LOOPS_API_KEY`: Your API key for Loops.so.

## Best Practices
-   Keep external integration logic focused solely on interacting with the third-party service.
-   Avoid including business logic specific to `backend` or `web` within this package when dealing with external services.
-   Use the shared `logger` from the `common` package for logging.
