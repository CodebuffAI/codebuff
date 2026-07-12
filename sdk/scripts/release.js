#!/usr/bin/env node

// Publishes @openbuff/sdk directly to the npm registry.
//
// Previously this script triggered a GitHub Actions workflow on the
// CodebuffAI/codebuff repo, which no longer exists for Openbuff. It now
// runs the publish locally: optional version bump -> npm pack dry-run
// verification -> npm publish --access public.
//
// Usage:
//   node scripts/release.js              # publish current version
//   node scripts/release.js patch        # bump patch then publish
//   node scripts/release.js minor        # bump minor then publish
//   node scripts/release.js 1.2.3       # set exact version then publish
//   node scripts/release.js --dry-run   # verify tarball, do not publish

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function log(message) {
  console.log(`📦 ${message}`)
}

function error(message) {
  console.error(`❌ ${message}`)
  process.exit(1)
}

function run(command) {
  log(`Running: ${command}`)
  try {
    return execSync(command, { stdio: 'inherit' })
  } catch (err) {
    error(`Command failed: ${command}\n${err.message}`)
  }
}

function readPackageJson() {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'),
  )
}

function writePackageJson(pkg) {
  fs.writeFileSync(
    path.join(process.cwd(), 'package.json'),
    JSON.stringify(pkg, null, 2) + '\n',
  )
}

function setVersion(versionType, pkg) {
  if (!versionType || versionType === '--dry-run') {
    return pkg.version
  }
  if (/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(versionType)) {
    pkg.version = versionType
  } else if (['patch', 'minor', 'major'].includes(versionType)) {
    run(`npm version ${versionType} --no-git-tag-version`)
    // npm version rewrites package.json; re-read it
    return readPackageJson().version
  } else {
    error(
      `Invalid version argument: ${versionType}\nExpected patch | minor | major | <semver> | --dry-run`,
    )
  }
  writePackageJson(pkg)
  return pkg.version
}

function main() {
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')
  const versionType = args.find((a) => !a.startsWith('--'))

  log('Initiating @openbuff/sdk release...')

  // Verify npm auth before doing anything destructive
  try {
    const whoami = execSync('npm whoami', { encoding: 'utf8' }).trim()
    log(`Logged in to npm as: ${whoami}`)
  } catch {
    error('Not logged in to npm. Run `npm login` first.')
  }

  const pkg = readPackageJson()
  if (pkg.private) {
    error(`package.json has "private": true — refusing to publish ${pkg.name}.`)
  }

  const version = setVersion(versionType, pkg)
  log(`Releasing ${pkg.name}@${version}`)

  // Verify the tarball contents
  log('Verifying package tarball (npm pack --dry-run)...')
  run('npm pack --dry-run')

  if (isDryRun) {
    log('Dry run complete. Re-run without --dry-run to publish.')
    return
  }

  // Publish
  log('Publishing to npm...')
  run(`npm publish --access public`)
  log(`✅ Published ${pkg.name}@${version}`)
  log(`View at: https://www.npmjs.com/package/${pkg.name}`)
}

main()
