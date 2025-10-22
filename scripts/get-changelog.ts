import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import { disableLiveUserInputCheck } from '@codebuff/agent-runtime/live-user-inputs'
import { models } from '@codebuff/common/old-constants'
import { generateCompactId } from '@codebuff/common/util/string'
import prettier from 'prettier'

import { promptAiSdk } from '../backend/src/llm-apis/vercel-ai-sdk/ai-sdk'

// Native slugify implementation
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
}

// Helper functions for date manipulation
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday as start of week
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function getWeekEnd(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? 0 : 7) // Sunday as end of week
  d.setDate(diff)
  d.setHours(23, 59, 59, 999)
  return d
}

function subtractWeeks(date: Date, weeks: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - weeks * 7)
  return d
}

function formatDate(date: Date, format: string): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  if (format === 'yyyy-MM-dd') {
    return `${year}-${month}-${day}`
  }
  if (format === 'MMMM d') {
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ]
    return `${monthNames[date.getMonth()]} ${date.getDate()}`
  }
  return date.toISOString()
}

function getWeekNumber(date: Date): number {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    )
  )
}

async function generateChangelog(end: Date) {
  // Fix: The start should be the beginning of the same week as 'end', not a week before
  const start = getWeekStart(end)

  // Format dates for git log command
  const startDate = formatDate(start, 'yyyy-MM-dd')
  const endDate = formatDate(end, 'yyyy-MM-dd')

  console.log(`\n📅 Processing week ending ${endDate}...`)

  // Check if changelog already exists for this week
  const changelogDir = path.join(process.cwd(), 'changelog')
  fs.mkdirSync(changelogDir, { recursive: true })
  const existingFiles = fs.readdirSync(changelogDir)
  const existingChangelog = existingFiles.find((file) =>
    file.startsWith(endDate),
  )

  if (existingChangelog) {
    console.log(
      `⏭️  Changelog already exists for week ending ${endDate}, skipping...`,
    )
    return true // Return true to indicate we should continue
  }

  try {
    // First, get all commit hashes and titles
    console.log(`🔍 Fetching commits from ${startDate} to ${endDate}...`)
    const commitsCommand = `git log --pretty=format:"%h : %s" --since="${startDate}" --until="${endDate}"`
    const commits = execSync(commitsCommand, { encoding: 'utf-8' })
      .split('\n')
      .filter((line) => line.trim())

    if (commits.length === 0) {
      console.log(`💤 No commits found for week ending ${endDate}`)
      return false // Return false to indicate we found a week with no commits
    }

    console.log(`📝 Found ${commits.length} commits, processing details...`)

    // Process each commit
    const processedCommits: string[] = []
    for (const commit of commits) {
      const [hash] = commit.split(' : ')

      // Get full commit details including body, without diff
      const detailsCommand = `git show ${hash} --pretty=format:"%B" --no-patch`
      const details = execSync(detailsCommand, { encoding: 'utf-8' })
        .split('\n')
        .filter((line) => line.trim())
        // Remove the first line (commit message) and any empty lines
        .slice(1)
        .filter((line) => line.trim())
        // Split by bullet points and format each one
        .map((line) => line.replace(/^-+\s*/, ''))
        .filter((line) => line.trim())
        .map((line) => `  - ${line}`)
        .join('\n')

      processedCommits.push(`${commit}${details ? '\n\n' + details : ''}`)
    }

    console.log(`🤖 Generating changelog content with AI...`)

    const prompt = `You are a technical writer creating a changelog for a software project. Based on the following git commits, create a well-structured changelog entry.

Git commits:
${processedCommits.join('\n\n')}

Please create a changelog with:
1. A descriptive title for this week's changes
2. Well-organized sections (e.g., Features, Bug Fixes, Improvements, etc.)
3. Clear, user-friendly descriptions of changes
4. Proper markdown formatting

Start your response with a heading using ### (three hashes) and organize the content below it.`

    disableLiveUserInputCheck()
    const response = await promptAiSdk({
      messages: [{ role: 'user', content: prompt }],
      clientSessionId: generateCompactId(),
      fingerprintId: generateCompactId(),
      userInputId: generateCompactId(),
      model: models.openrouter_claude_sonnet_4,
      userId: undefined,
      chargeUser: false,
      sendAction: () => {},
      liveUserInputRecord: {},
      sessionConnections: {},
      logger: console,
      trackEvent: () => {},
    })

    // Clean up the AI response
    console.log(`🧹 Cleaning up AI response...`)
    const cleanedText = response
      // Remove everything before the first ###
      .replace(/^[\s\S]*?(?=###)/, '')
      // Replace ### with ##
      .replace(/###/g, '##')

    // Extract the first heading for the filename
    const firstHeading = cleanedText.match(/^##\s+(.+)$/m)?.[1] ?? 'changelog'
    const filename = `${endDate}-${slugify(firstHeading)}.mdx`

    // Remove the first heading if it matches the title
    const contentWithoutFirstHeading = cleanedText
      .replace(/^##\s+.+$/m, '')
      .trim()

    // Create changelog content with front matter
    const changelogContent = `---
title: "${firstHeading}"
description: "Week ${getWeekNumber(start)}, ${start.getFullYear()} — ${formatDate(start, 'MMMM d')} to ${formatDate(end, 'MMMM d')}"
---

${contentWithoutFirstHeading}`

    // Write to the changelog file
    const changelogPath = path.join(changelogDir, filename)
    fs.writeFileSync(
      changelogPath,
      await prettier.format(changelogContent, { parser: 'markdown' }),
    )

    console.log(`✨ Successfully generated changelog at ${changelogPath}`)
    return true // Return true to indicate we should continue
  } catch (error) {
    console.error(
      `❌ Error generating changelog for week ending ${endDate}:`,
      error,
    )
    return true // Return true to continue even if there's an error
  }
}

async function updateDocsJsonWithChangelogs() {
  const docsJsonPath = path.join(process.cwd(), 'changelog', 'docs.json')
  const changelogDir = path.join(process.cwd(), 'changelog')
  const changelogFiles = fs
    .readdirSync(changelogDir)
    .filter((file) => file.endsWith('.mdx'))
    .sort()

  // Group changelogs by quarter
  const changelogGroups: { [key: string]: string[] } = {}
  for (const file of changelogFiles) {
    const match = file.match(/(\d{4})-(\d{2})-\d{2}-.+/)
    if (!match) continue
    const year = match[1]
    const month = parseInt(match[2], 10)
    let quarter = 'Q1'
    if (month >= 10) quarter = 'Q4'
    else if (month >= 7) quarter = 'Q3'
    else if (month >= 4) quarter = 'Q2'
    // else Q1
    const groupName = `${quarter} ${year}`
    if (!changelogGroups[groupName]) changelogGroups[groupName] = []
    changelogGroups[groupName].push(`changelog/${file.replace(/\.mdx$/, '')}`)
  }

  // Read and parse docs.json
  let docsJson: any
  try {
    docsJson = JSON.parse(fs.readFileSync(docsJsonPath, 'utf-8'))
  } catch (error) {
    docsJson = { navigation: { tabs: [{ tab: 'Changelog', groups: [] }] } }
  }
  const tabs: { tab: string; groups: { group: string; pages: string[] }[] }[] =
    docsJson.navigation.tabs
  const changelogTab = tabs.find((tab) => tab.tab === 'Changelog')
  if (!changelogTab) return

  // Replace groups with new changelog groups, sorted by most recent year and quarter (Q4, Q3, Q2, Q1)
  changelogTab.groups = Object.entries(changelogGroups)
    .sort((a, b) => {
      // a[0] and b[0] are like 'Q3 2024'
      const [qa, ya] = a[0].split(' ')
      const [qb, yb] = b[0].split(' ')
      // Sort by year descending
      if (yb !== ya) return parseInt(yb) - parseInt(ya)
      // Sort by quarter: Q4 > Q3 > Q2 > Q1
      const quarterOrder: { [key: string]: number } = {
        Q4: 4,
        Q3: 3,
        Q2: 2,
        Q1: 1,
      }
      return quarterOrder[qb] - quarterOrder[qa]
    })
    .map(([group, pages]) => ({
      group,
      pages: (pages as string[]).sort((a, b) => b.localeCompare(a)), // latest post on top
    }))

  // Write back to docs.json
  fs.writeFileSync(docsJsonPath, JSON.stringify(docsJson, null, 2) + '\n')
  console.log('✅ Updated docs.json with latest changelogs grouped by quarter.')
}

async function generateAllChangelogs() {
  console.log(`🚀 Starting changelog generation...`)
  // Start from the end of last week, not the current week
  let currentWeek = getWeekEnd(subtractWeeks(new Date(), 1))

  // Only generate changelogs for 3 weeks as a test
  for (let i = 0; i < 3; i++) {
    await generateChangelog(currentWeek)
    currentWeek = subtractWeeks(currentWeek, 1)
  }

  await updateDocsJsonWithChangelogs()

  console.log(`🎉 Finished generating up to 3 changelogs!`)
  console.log(
    `📅 Stopped at week ending ${formatDate(currentWeek, 'yyyy-MM-dd')}`,
  )
}

generateAllChangelogs()
