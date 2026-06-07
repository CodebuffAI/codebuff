# Freebuff Web Codebuff Service Account

Freebuff Web runs `@codebuff/sdk` inside Convex actions. It authenticates to
the Codebuff API with a dedicated service account rather than a personal user
account.

The service account is unmetered, but each model call is still written to the
normal message usage records with its real provider cost and zero charged
credits. Bans and the normal API validation still apply.

Freebuff Convex also stores operational usage:

- `freebuff_agent_runs` records the Freebuff user, project, status, and
  normalized metered credits for every run.
- `freebuff_daily_usage` aggregates runs, metered credits, errors, and
  timeouts by Freebuff user and UTC day.
- `admin_usage.getAdminUsageData` returns today's highest-usage users and a
  `spikeDetected` flag for unusually high usage or error volume.

Codebuff Postgres and BigQuery remain authoritative for exact provider dollar
cost and token counts. Convex's normalized credits are intended for fast
product-level monitoring, rate limits, and abuse detection.

## Provision or Rotate

Run this against the Codebuff production database:

```bash
bun scripts/create-freebuff-web-service-account.ts --apply
```

The script creates the dedicated user if necessary, revokes its previous
credentials, and prints:

- `FREEBUFF_WEB_SERVICE_USER_ID`: set this only on the Codebuff API server.
- `CODEBUFF_API_KEY`: set this only in the Freebuff Web Convex deployment.

Redeploy the Codebuff API after setting the service user ID. Convex actions
read the API key at runtime, so updating the Convex environment is sufficient
for a key rotation.

Never expose `CODEBUFF_API_KEY` through a `NEXT_PUBLIC_*` variable or send it
to the browser. Browser origin headers are not an authentication boundary.

## Emergency Revoke

Run the provisioning command again to rotate the key, or delete the dedicated
user's `session` rows. Removing `FREEBUFF_WEB_SERVICE_USER_ID` from the
Codebuff API server immediately restores normal credit checks for the account.

## Temporary Credit Grant Alternative

For a normal user account, `bun scripts/grant-credits.ts` can add a large
non-expiring admin credit grant. This is not recommended for Freebuff Web:
credits eventually deplete, personal usage becomes mixed with service usage,
and every credential for that user can spend the grant.
