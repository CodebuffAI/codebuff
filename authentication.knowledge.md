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
   - Backend appends this auth code to the login URL: `${NEXT_PUBLIC_APP_URL}/login?auth_code=<token-goes-here>`

3. User Login:

   - npm-app receives the link, displays it to the user, and automatically opens the browser.
   - User visits the link and goes through the OAuth flow.
   - The `redirect_uri` should include the auth code as a query parameter.
   - If needed, store the auth code in local storage to persist through OAuth flows.

4. Credential Verification:

   - After OAuth, the browser calls the `app/onboard` server component with the auth code and user credentials.
   - The server component verifies the hash using received values and stores the `fingerprintId` + hash in a new session row in the database.

5. Session Establishment:
   - npm-app sends a WebSocket message every few seconds to the backend to check for a session with the same `fingerprintId` and hash.
   - If a matching session is found, the backend sends the user's credentials to the CLI via WebSockets.
   - npm-app saves the credentials locally.

## Security Considerations

- The one-time auth code includes a hash with a secret value, ensuring the request comes from a trusted source.
- The auth code has a short expiration time (5 minutes) to limit the window of potential misuse.
- The `fingerprintId` is used to link the CLI session with the web login, preventing session hijacking.
- User credentials are never stored or transmitted in plain text.

## Implementation Guidelines

- Centralize authentication-related logic in one place to prevent synchronization issues.
- Handle fingerprint generation and user credential loading together in `setUser()`.
- Avoid duplicating credential checking or fingerprint generation logic across different parts of the codebase.
- Always use existing fingerprintId from user credentials when available, only generate new ones when needed.
- Reference fingerprintId from the Client instance rather than config exports to maintain single source of truth.
- Always use existing fingerprintId from user credentials when available, only generate new ones when needed.
- Reference fingerprintId from the Client instance rather than config exports to maintain single source of truth.

## Integration with Billing

- Upon successful authentication, the user's billing status and quota are retrieved from the database.
- The authenticated user's quota and usage limits are applied to their session.
- Subscription status affects the user's access to premium features and higher usage limits.

## Best Practices

1. Always use secure WebSocket connections (WSS) in production environments.
2. Regularly rotate secret keys used for hash generation.
3. Implement rate limiting on authentication attempts to prevent brute-force attacks.
4. Use HTTPS for all web communications, especially during the OAuth flow.
5. Regularly audit and update the authentication flow to address new security concerns.
6. Initialize critical authentication properties (like fingerprintId) in class constructors:
   - Ensure properties are available immediately after instantiation
   - Prevent undefined states during authentication flow
   - Make TypeScript type checking more effective
   - For async initialization:
     - Option 1 - Split initialization:
       - Split into sync (constructor) and async (init method) steps
       - Use temporary placeholder values in constructor
       - Complete async initialization in separate connect/init method
     - Option 2 - Pre-calculate async values:
       - Calculate required async values before class instantiation
       - Pass pre-calculated values to constructor
       - Ensures all required values are available immediately
       - Preferred when values must be valid at construction time
   - For async initialization:
     - Split into sync (constructor) and async (init method) steps
     - Use temporary placeholder values in constructor
     - Complete async initialization in separate connect/init method
6. Initialize critical authentication properties (like fingerprintId) in class constructors:
   - Ensures properties are available immediately after instantiation
   - Prevents undefined states during authentication flow
   - Makes TypeScript type checking more effective

## Future Considerations

1. Implement multi-factor authentication for enhanced security.
2. Consider using JSON Web Tokens (JWT) for stateless authentication.
3. Develop a system for handling password resets and account recovery.
4. Implement a more robust session management system with the ability to revoke sessions.
