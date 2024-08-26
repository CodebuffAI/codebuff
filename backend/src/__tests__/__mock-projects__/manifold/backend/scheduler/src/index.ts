import { initFirebase, initSecrets } from './utils'
initFirebase()

import * as fs from 'fs'
import * as path from 'path'
import * as Handlebars from 'handlebars'
import * as express from 'express'
import * as basicAuth from 'express-basic-auth'
import { sortBy } from 'lodash'
import { isProd } from 'shared/utils'
import { log } from 'shared/utils'
import { createJobs } from './jobs'
import { MINUTE_MS } from 'common/util/time'
import { METRIC_WRITER } from 'shared/monitoring/metric-writer'

const PORT = (process.env.PORT ? parseInt(process.env.PORT) : null) || 8080

function loadTemplate(filename: string) {
  const p = path.join(__dirname, './templates', filename)
  return Handlebars.compile(fs.readFileSync(p, 'utf8'))
}
const indexTemplate = loadTemplate('index.hbs')

const app = express()
app.use(express.json())

METRIC_WRITER.start()

const server = app.listen(PORT, async () => {
  await initSecrets()

  const prod = isProd()
  log.info(`Running in ${prod ? 'prod' : 'dev'} listening on port ${PORT}.`)
  app.use(
    basicAuth({
      users: { admin: process.env.SCHEDULER_AUTH_PASSWORD ?? '' },
      challenge: true,
      realm: prod
        ? 'scheduler.manifold.markets'
        : 'scheduler.dev.manifold.markets',
    })
  )

  const jobs = createJobs()
  const jobsByName = Object.fromEntries(jobs.map((j) => [j.name, j]))
  log.info(`Loaded ${jobs.length} job(s).`, { names: Object.keys(jobsByName) })

  app.get('/', async (_req, res) => {
    const now = Date.now()
    const timeZone = 'America/Los_Angeles'
    const jobsData = jobs.map((j) => {
      const currentRun = j.currentRun()
      const currentRunStart = currentRun
        ? new Date(currentRun.getTime()).toLocaleString('en-US', {
            timeZone,
            hour12: true,
            timeZoneName: 'short',
          })
        : null
      const currentRunDurationMins = currentRun
        ? Math.ceil((now - currentRun.getTime()) / MINUTE_MS)
        : null
      const nextRun = j.nextRun()
      const nextRunStart = nextRun
        ? new Date(nextRun.getTime()).toLocaleString('en-US', {
            timeZone,
            hour12: true,
            timeZoneName: 'short',
          })
        : null
      const nextRunInMins = nextRun
        ? Math.ceil((nextRun.getTime() - now) / MINUTE_MS)
        : null
      return {
        name: j.name,
        pattern: j.getPattern(),
        running: j.isBusy(),
        paused: (j as any)._states.paused,
        status: (j as any)._states.paused
          ? 'paused'
          : j.currentRun()
          ? 'running'
          : 'waiting',
        currentRunStart,
        currentRunDurationMins,
        nextRunStart,
        nextRunInMins,
      }
    })
    const sortedJobsData = sortBy(
      jobsData,
      (j) => (j.running ? 0 : 1),
      (j) => j.currentRunStart,
      (j) => j.name
    )
    res.set('Content-Type', 'text/html')
    return res.status(200).send(
      indexTemplate({
        env: isProd() ? 'Prod' : 'Dev',
        jobs: sortedJobsData,
      })
    )
  })

  app.post('/jobs/:name/trigger', async (req, res) => {
    const job = jobsByName[req.params.name]
    if (job == null) {
      res.status(400).json({ success: false, err: 'Invalid job name.' })
    }
    job.trigger()
    return res.status(200).json({ success: true })
  })

  app.post('/jobs/:name/pause', async (req, res) => {
    const job = jobsByName[req.params.name]
    if (job == null) {
      res.status(400).json({ success: false, err: 'Invalid job name.' })
    }
    job.pause()
    return res.status(200).json({ success: true })
  })

  app.post('/jobs/:name/resume', async (req, res) => {
    const job = jobsByName[req.params.name]
    if (job == null) {
      res.status(400).json({ success: false, err: 'Invalid job name.' })
    }
    job.resume()
    return res.status(200).json({ success: true })
  })
})

process.on('SIGTERM', () => {
  log.info('Received SIGTERM.')
  server.close((err) => {
    process.exit(err ? 1 : 0)
  })
})
