import { internal } from "!/_generated/api";
import { cronJobs } from "convex/server";

const crons = cronJobs();

crons.interval(
  "replenish pool if empty",
  { minutes: 10 },
  internal.pool_management.replenishPoolIfEmpty,
);

// GitHub token rotation - run every 60 minutes to keep tokens fresh
crons.interval(
  "rotate expiring github tokens",
  { minutes: 60 },
  internal.github.tokens.rotation.scheduleTokenRotation,
);

// Clean up expired OAuth states - run every 15 minutes
crons.interval(
  "cleanup expired oauth states",
  { minutes: 15 },
  internal.github.auth.oauth.cleanupExpiredStates,
);

// Send pending ticket notification emails - run every 5 minutes
crons.interval(
  "send pending ticket notification emails",
  { minutes: 5 },
  internal.tickets_email.processPendingEmails,
);

// Check and unpause users with replenished resource limits - run every 24 hours
crons.interval(
  "check and unpause users with replenished credits",
  { hours: 24 },
  internal.deployment_management.checkAndUnpausePausedUsers,
);

export default crons;
