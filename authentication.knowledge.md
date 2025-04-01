# Authentication Flow for Codebuff

## Overview

Codebuff implements a secure authentication flow between the CLI (npm-app), backend, and web application.

## Lifecycle:

```mermaid
stateDiagram-v2
    [*] --> Unauthenticated

    state Unauthenticated {
        state "No Credentials" as NC
        state "Generate Fingerprint" as GF
        NC --> GF
    }

    state "Core Auth Flow" as Core {
        state "Request Auth Code" as RAC
        state "OAuth Flow" as OAuth
        state "Session Check" as SC
        RAC --> OAuth
        OAuth --> SC
    }

    state Success {
        state "Save Credentials" as Save
        state "Ready" as Ready
        Save --> Ready
    }

    state Failure {
        state "Log Security Event" as Log
        state "Return to Start" as Return
        Log --> Return
    }

    Unauthenticated --> Core
    Core --> Success : Valid user
    Core --> Failure : Invalid/conflict
    Success --> Unauthenticated : Logout
    Failure --> Unauthenticated
```

## Core Authentication Flow

This is the common path that all authentication attempts follow:

```mermaid
sequenceDiagram
    participant CLI as npm-app
    participant Web as web app
    participant DB as Database

    CLI->>Web: POST /api/auth/cli/code {fingerprintId}
    Web->>DB: Check active sessions
    Web->>Web: Generate auth code (1h expiry)
    Web->>CLI: Return login URL
    CLI->>CLI: Open browser
    Note over Web: User completes OAuth
    Web->>DB: Check fingerprint ownership
    Web->>DB: Create/update session
    loop Every 5s
        CLI->>Web: GET /api/auth/cli/status
        Web->>DB: Check session
    end
```

## Entry Points

### 1. First Time Login
```mermaid
sequenceDiagram
    participant CLI as npm-app
    participant HW as Hardware Info

    CLI->>HW: Get system info
    HW->>CLI: Return hardware details
    CLI->>CLI: Generate random bytes
    CLI->>CLI: Hash(hardware + random)
    Note over CLI: Continues to core flow<br/>with new fingerprintId
```

### 2. Logout Flow
```mermaid
sequenceDiagram
    participant CLI as npm-app
    participant Web as web app
    participant HW as Hardware Info

    Note over CLI: User types 'logout'
    CLI->>Web: POST /api/auth/cli/logout
    Web-->>CLI: OK
    CLI->>CLI: Delete credentials.json
    Note over CLI: User types 'login'
    CLI->>HW: Get system info
    HW->>CLI: Return hardware details
    CLI->>CLI: Generate random bytes
    CLI->>CLI: Hash(hardware + random)
    Note over CLI: Continues to core flow<br/>with new fingerprintId
```

### 3. Missing Credentials
```mermaid
sequenceDiagram
    participant CLI as npm-app
    participant FS as File System
    participant HW as Hardware Info

    CLI->>FS: Check credentials.json
    FS-->>CLI: File not found
    CLI->>HW: Get system info
    HW->>CLI: Return hardware details
    CLI->>CLI: Generate random bytes
    CLI->>CLI: Hash(hardware + random)
    Note over CLI: Continues to core flow<br/>with new fingerprintId
```

## Exit Points

### 1. Success: New Device
```mermaid
sequenceDiagram
    participant CLI as npm-app
    participant Web as web app
    participant DB as Database

    Note over CLI,DB: Continuing from core flow...
    Web->>DB: Check fingerprint (not found)
    Web->>DB: Create fingerprint record
    Web->>DB: Create new session
    Web->>CLI: Return user credentials
    CLI->>CLI: Save credentials.json
    Note over CLI: Ready for use
```

### 2. Success: Known Device
```mermaid
sequenceDiagram
    participant CLI as npm-app
    participant Web as web app
    participant DB as Database

    Note over CLI,DB: Continuing from core flow...
    Web->>DB: Check fingerprint (found)
    Web->>DB: Verify ownership
    Web->>DB: Update existing session
    Web->>CLI: Return user credentials
    CLI->>CLI: Save credentials.json
    Note over CLI: Ready for use
```

### 3. Failure: Ownership Conflict
```mermaid
sequenceDiagram
    participant CLI as npm-app
    participant Web as web app
    participant DB as Database

    Note over CLI,DB: Continuing from core flow...
    Web->>DB: Check fingerprint
    DB-->>Web: Found with different owner
    Web-->>Web: Log security event
    Web-->>Web: Log ownership conflict
    Web->>CLI: Return error
    Note over CLI: User must generate new fingerprint
```

### 4. Failure: Invalid/Expired Code
```mermaid
sequenceDiagram
    participant CLI as npm-app
    participant Web as web app

    Note over CLI,Web: Continuing from core flow...
    Web-->>Web: Validate auth code
    Web-->>Web: Check expiration
    Web->>CLI: Return error
    Note over CLI: User must request new code
```

## Security Features

- Auth codes expire after 1 hour
- FingerprintIds are unique per device:
  - Hardware info + 8 random bytes ensures uniqueness
  - Attempts by other users are blocked and logged
  - Original user sessions remain secure
- Credentials never stored/transmitted in plain text
- All auth attempts and conflicts logged for monitoring

## Implementation Guidelines

1. Centralize Auth Logic:
   - Keep auth code in one place
   - Handle fingerprint and credentials together
   - Avoid duplicating auth checks

2. Fingerprint Management:
   - Use existing fingerprintId from credentials when available
   - Only generate new ones for first-time users
   - Reference fingerprintId from Client instance (single source of truth)

3. Class Initialization:
   - Initialize auth properties in constructors
   - Use pre-calculated async values with defaults
   - Override defaults with user values if available

4. User Identity:
   - Maintain single source of truth
   - Keep related data with user object
   - Client class owns user state
