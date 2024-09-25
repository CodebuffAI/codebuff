# Authentication Flow for Manicode

## Overview

Manicode implements a secure authentication flow that involves the npm-app (CLI), backend, and web application. This document outlines the key steps and security measures in place.

## Authentication Process

1. CLI Initiation:

   - The npm-app sends a `fingerprintId` to the backend via WebSocket on a `login` message type.

2. One-Time Auth Code:

   - Backend creates a one-time auth code consisting of:
     a. `fingerprintId` (to link the current session with user credentials)
     b. Timestamp (5 minutes in the future, for link expiration)
     c. Hash of the above + a secret value (for request verification)
   - Backend appends this auth code to the login URL: `${APP_URL}/login?auth_code=<token-goes-here>`

3. User Login:

   - npm-app receives the link, displays it to the user, and automatically opens the browser.
   - User visits the link and goes through the OAuth flow.
   - The `redirect_uri` should include the auth code as a query parameter.
   - If needed, store the auth code in local storage to persist through OAuth flows.

4. Credential Verification:

   - After OAuth, the browser calls the backend with the auth code and user credentials.
   - Backend verifies the hash using received values.
   - Backend stores the `fingerprintId` with the user row in the database.

5. Session Establishment:
   - Backend sends a WebSocket message to the CLI connected on the same `fingerprintId`, containing user data.
   - Alternatively, backend sends user credentials to the user's CLI via WebSockets.

## Security Considerations

- The one-time auth code includes a hash with a secret value, ensuring the request comes from a trusted source.
- The auth code has a short expiration time (5 minutes) to limit the window of potential misuse.
- The `fingerprintId` is used to link the CLI session with the web login, preventing session hijacking.
- User credentials are never stored or transmitted in plain text.
