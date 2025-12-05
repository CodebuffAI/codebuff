-- E2E Test Seed Data
-- This file contains base test data for e2e tests

-- Create a test user with known credentials
INSERT INTO "user" (id, name, email, "emailVerified", created_at)
VALUES (
  'e2e-test-user-001',
  'E2E Test User',
  'e2e-test@codebuff.test',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Create a session token for the test user (expires in 1 year)
INSERT INTO "session" ("sessionToken", "userId", expires, type)
VALUES (
  'e2e-test-session-token-001',
  'e2e-test-user-001',
  NOW() + INTERVAL '1 year',
  'cli'
) ON CONFLICT ("sessionToken") DO NOTHING;

-- Grant initial credits to the test user (1000 credits)
INSERT INTO credit_ledger (operation_id, user_id, principal, balance, type, description, priority, created_at)
VALUES (
  'e2e-initial-grant-001',
  'e2e-test-user-001',
  1000,
  1000,
  'free',
  'E2E Test Initial Credits',
  1,
  NOW()
) ON CONFLICT (operation_id) DO NOTHING;

-- Create a second test user for multi-user scenarios
INSERT INTO "user" (id, name, email, "emailVerified", created_at)
VALUES (
  'e2e-test-user-002',
  'E2E Test User 2',
  'e2e-test-2@codebuff.test',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- Create a session token for the second test user
INSERT INTO "session" ("sessionToken", "userId", expires, type)
VALUES (
  'e2e-test-session-token-002',
  'e2e-test-user-002',
  NOW() + INTERVAL '1 year',
  'cli'
) ON CONFLICT ("sessionToken") DO NOTHING;

-- Grant credits to the second test user (500 credits)
INSERT INTO credit_ledger (operation_id, user_id, principal, balance, type, description, priority, created_at)
VALUES (
  'e2e-initial-grant-002',
  'e2e-test-user-002',
  500,
  500,
  'free',
  'E2E Test Initial Credits',
  1,
  NOW()
) ON CONFLICT (operation_id) DO NOTHING;

-- Create a test user with low credits for testing credit warnings
INSERT INTO "user" (id, name, email, "emailVerified", created_at)
VALUES (
  'e2e-test-user-low-credits',
  'E2E Low Credits User',
  'e2e-low-credits@codebuff.test',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO "session" ("sessionToken", "userId", expires, type)
VALUES (
  'e2e-test-session-low-credits',
  'e2e-test-user-low-credits',
  NOW() + INTERVAL '1 year',
  'cli'
) ON CONFLICT ("sessionToken") DO NOTHING;

-- Grant only 10 credits to low-credits user
INSERT INTO credit_ledger (operation_id, user_id, principal, balance, type, description, priority, created_at)
VALUES (
  'e2e-initial-grant-low',
  'e2e-test-user-low-credits',
  10,
  10,
  'free',
  'E2E Test Low Credits',
  1,
  NOW()
) ON CONFLICT (operation_id) DO NOTHING;
