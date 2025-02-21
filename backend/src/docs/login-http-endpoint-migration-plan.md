# Migration Plan: Converting Login WebSocket Subscriptions to HTTP Endpoints

This document describes the exact steps and code changes required to migrate the following login-related WebSocket subscriptions to plain HTTP requests:
- login-code-request
- login-status-request
- clear-auth-token
- auth-result (response from login-status)
- login-code-response

Below are the necessary changes:

---

## 1. Backend Changes

NOTE: this section is just to talk out how we'll migrate the login flow. The actual pseudocode we should write is in the next section.

### A. WebSocket Actions Being Converted

Current WebSocket actions that will be converted to HTTP endpoints:

1. `login-code-request` → POST `/api/auth/code`
   - Current: `webSocket.sendAction({ type: 'login-code-request', fingerprintId, referralCode })`
   - Returns: `login-code-response` with loginUrl and fingerprintHash

2. `login-status-request` → GET `/api/auth/status`
   - Current: `webSocket.sendAction({ type: 'login-status-request', fingerprintId, fingerprintHash })`
   - Returns: `auth-result` with user details or error

3. `clear-auth-token` → POST `/api/auth/logout`
   - Current: `webSocket.sendAction({ type: 'clear-auth-token', authToken, userId, fingerprintId, fingerprintHash })`

Key Implementation Notes:
- All endpoints will be under the `/api` prefix
- Standard HTTP error handling without custom retry logic
- Client maintains existing state management (`shouldRequestLogin`, `expectedFingerprintHash`)
- Referral code handling remains in the web app's onboard page
- No WebSocket-specific error handling needed (timeouts, reconnection, etc.)

### B. Create New HTTP Endpoints
Create a new Express router (for example, in `backend/src/api/auth/login.ts`) to replace the current WebSocket-based login flows. Implement the following endpoints:

1. **POST /api/auth/login-code-request**
   Simplified name: POST /auth/code
   - **Request Body:**
     ```typescript
     {
       fingerprintId: string,
       referralCode?: string
     }
     ```
   - **Action:**
     Move the logic from the current `onLoginCodeRequest` (in `websocket-action.ts`) into this handler. This includes:
     - Inserting the fingerprint into the DB (using `db.insert(schema.fingerprint)`)
     - Creating the fingerprint hash and calculating expiry (using `genAuthCode`)
     - Generating the login URL (with optional referral code appended)
     - Returning JSON with fingerprintId, fingerprintHash, and loginUrl

2. **GET /api/auth/login-status**
   Simplified name: GET /auth/status
   - **Query Parameters:**
     - `fingerprintId`: string
     - `fingerprintHash`: string
   - **Action:**
     Copy the logic from `onLoginStatusRequest`:
     - Query the DB (join `user`, `session`, and `fingerprint`) for matching fingerprintId and fingerprintHash
     - If user exists, return a JSON response containing the user details and a success message.
     - Otherwise, return an error JSON (HTTP 4xx).

3. **POST /api/auth/clear-auth-token**
   Simplified name: POST /auth/logout
   - **Request Body:**
     ```typescript
     {
       authToken: string,
       userId: string,
       fingerprintId: string,
       fingerprintHash: string
     }
     ```
   - **Action:**
     Use the logic from `onClearAuthTokenRequest` to delete the session. Return a success or error JSON response accordingly.

### B. Remove WebSocket Subscriptions
Remove or disable the following subscriptions from the WebSocket connection (in `backend/src/websockets/websocket-action.ts`):

- Remove:
  - `subscribeToAction('login-code-request', onLoginCodeRequest)`
  - `subscribeToAction('login-status-request', onLoginStatusRequest)`
  - `subscribeToAction('clear-auth-token', onClearAuthTokenRequest)`

*Note:* Any code that sends or handles "login-code-response" or "auth-result" via WebSocket should also be removed.

---

## 2. Client (npm-app) Changes

### A. Modify the Login Flow in the Client
In the npm-app code (e.g. in `npm-app/src/client.ts`):

1. **Initiate Login Code Request:**
   - Replace the current WebSocket-based call with an HTTP POST to `/api/auth/login-code-request`.
   - Use the returned JSON (which includes `loginUrl`, `fingerprintId`, and `fingerprintHash`) to display the login URL to the user and open the browser if needed.

2. **Polling Login Status:**
   - Remove the WebSocket subscription for "login-code-response" and "auth-result".
   - Implement periodic HTTP GET requests to `/api/auth/login-status` (passing the `fingerprintId` and `fingerprintHash` as query parameters) to check if the user has completed login.
   - On a successful response, update the local credentials (and also store them on disk as done previously).

3. **Clear Auth Token:**
   - Replace the WebSocket call for clearing the token with an HTTP POST to `/api/auth/clear-auth-token`.

### B. Update Error Handling & User Messaging
- Ensure that the HTTP endpoints return standard HTTP status codes (e.g. 200 for success, 401 for unauthorized, 500 for errors).
- Update the client error messaging logic to consume the JSON responses over HTTP, rather than WebSocket messages.

---

## 3. Integration, Testing, and Documentation

### A. Integration
- Ensure that the newly created HTTP endpoints are attached to your main Express app (e.g. in `backend/src/index.ts`, use `app.use('/api/auth', loginRouter)`).

### B. Testing
- Update existing tests (or add new ones) to verify that:
  - A POST to `/api/auth/login-code-request` returns the correct login details.
  - The GET `/api/auth/login-status` endpoint returns the proper authentication result based on the supplied fingerprint.
  - The POST `/api/auth/clear-auth-token` successfully deletes a session.
- Verify that the client (npm-app) now calls these endpoints and correctly handles the new responses.

### C. Documentation
- Update any public or internal documentation (e.g. `authentication.knowledge.md`) to reflect the new HTTP-based login flow.
- Ensure that client instructions (help messages, CLI prompts) are updated with the new flow.

---

## Code Snippets (Pseudocode)

### Backend (Express Router pseudocode)
```typescript
// backend/src/api/auth/login.ts

import express from 'express';
import { genAuthCode } from 'common/util/credentials';
import { env } from '@/env.mjs';
import db from 'common/db';
import * as schema from 'common/db/schema';
import { getNextQuotaReset } from 'common/util/dates';

const router = express.Router();

// POST /api/auth/login-code-request
router.post('/auth/code', async (req, res) => {
  const { fingerprintId, referralCode } = req.body;
  // Insert fingerprint if not exists
  await db.insert(schema.fingerprint).values({ id: fingerprintId }).onConflictDoNothing();
  const expiresAt = Date.now() + 60 * 60 * 1000;
  const fingerprintHash = genAuthCode(fingerprintId, expiresAt.toString(), env.NEXTAUTH_SECRET);
  const loginUrl = `${env.NEXT_PUBLIC_APP_URL}/login?auth_code=${fingerprintId}.${expiresAt}.${fingerprintHash}${referralCode ? \`&referral_code=\${referralCode}\` : ''}`;
  return res.json({ fingerprintId, fingerprintHash, loginUrl });
});

// GET /api/auth/login-status
router.get('/auth/status', async (req, res) => {
  const { fingerprintId, fingerprintHash } = req.query;
  // Query DB for a matching session and user (logic as in onLoginStatusRequest)
  // ...
  if (foundUser) {
    return res.json({ user: foundUser, message: 'Authentication successful!' });
  }
  return res.status(401).json({ error: 'Authentication failed' });
});

// POST /api/auth/clear-auth-token
router.post('/auth/logout', async (req, res) => {
  const { authToken, userId, fingerprintId, fingerprintHash } = req.body;
  // Delete session from DB (logic as in onClearAuthTokenRequest)
  // ...
  return res.json({ message: 'Auth token cleared successfully' });
});

export default router;
```

### Client (HTTP call pseudocode)
```typescript
// In npm-app/src/client.ts, replace login method:

async login(referralCode?: string) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/auth/login-code-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprintId: await this.getFingerprintId(), referralCode }),
  });
  const { loginUrl, fingerprintHash } = await response.json();
  // Notify user and open browser:
  console.log(`Visit the following URL to login: ${loginUrl}`);
  // Open browser logic, and start polling login status via HTTP GET
}
```

---

This plan covers the necessary backend and client-side changes to migrate our login flow from WebSockets to HTTP. Please review and let me know if there are any questions or if further details are needed.
