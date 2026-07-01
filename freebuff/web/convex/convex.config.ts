// convex/convex.config.ts
import crons from '@convex-dev/crons/convex.config'
import migrations from '@convex-dev/migrations/convex.config'
import rateLimiter from '@convex-dev/rate-limiter/convex.config'
import workflow from '@convex-dev/workflow/convex.config'
import workpool from '@convex-dev/workpool/convex.config'
import aggregate from '@convex-dev/aggregate/convex.config'

import { defineApp } from 'convex/server'

const app = defineApp()
app.use(workflow)

app.use(migrations)

app.use(workpool, { name: 'migrationWorkpool' })

app.use(rateLimiter)

// Runtime-registered cron jobs, one per Automation (see convex/automations.ts).
app.use(crons)

// Separate aggregate instances to avoid data interference and improve throughput
// Each aggregate type gets its own component to prevent count conflicts
app.use(aggregate, { name: 'allUsersAggregate' })
app.use(aggregate, { name: 'userActivityAggregate' })
app.use(aggregate, { name: 'activeUsersByDayAggregate' })
app.use(aggregate, { name: 'usersByRoleAggregate' })
app.use(aggregate, { name: 'usersByTierAggregate' })
app.use(aggregate, { name: 'usersByDayAggregate' })
app.use(aggregate, { name: 'allProjectsAggregate' })
app.use(aggregate, { name: 'projectsByDayAggregate' })
// Freebuff Cloud (connected_repo) usage analytics
app.use(aggregate, { name: 'cloudActiveUsersByDayAggregate' })
app.use(aggregate, { name: 'cloudProjectsByTypeDayAggregate' })
// Freebuff Web (template / non-connected_repo) usage analytics
app.use(aggregate, { name: 'webActiveUsersByDayAggregate' })
app.use(aggregate, { name: 'allConvexInstancesAggregate' })
app.use(aggregate, { name: 'pausedProjectsByActiveAggregate' })
app.use(aggregate, { name: 'pausedUsersByActiveAggregate' })

export default app
