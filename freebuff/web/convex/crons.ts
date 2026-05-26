import { internal } from "!/_generated/api";
import { cronJobs } from "convex/server";

const crons = cronJobs();

crons.interval(
  "replenish pool if empty",
  { minutes: 10 },
  internal.pool_management.replenishPoolIfEmpty,
);

// GitHub token rotation - run every 30 minutes to keep tokens fresh
crons.interval(
  "rotate expiring github tokens",
  { minutes: 30 },
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

// Check and unpause users with replenished resource limits - run daily at 2 AM UTC
crons.daily(
  "check and unpause users with replenished credits",
  { hourUTC: 2, minuteUTC: 0 },
  internal.deployment_management.checkAndUnpausePausedUsers,
  {},
);

export default crons;
